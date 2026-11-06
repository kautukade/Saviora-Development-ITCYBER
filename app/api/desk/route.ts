/**
 * The assistant, streamed.
 *
 * A server action returns once, at the end. This one has up to four model calls
 * to make before it knows the answer, so returning once meant several seconds
 * of a blank screen — long enough that the doctor assumes it is broken and
 * presses it again. Here each step is sent as it happens: what it is doing, then
 * the answer a few words at a time.
 *
 * It also writes the chat down. The turn is saved on the server rather than by
 * the browser, so a reply survives the doctor locking his phone mid-answer.
 */

import { after } from 'next/server';

import { currentDoctor } from '@/lib/auth';
import { streamDesk, type DeskTurn } from '@/lib/desk';
import { addTurn, startChat, turnsIn } from '@/lib/deskchat';

export async function POST(request: Request) {
  const doctor = await currentDoctor();
  if (!doctor) return new Response('Not signed in', { status: 401 });

  const body = await request.json().catch(() => null);
  const question = String(body?.question ?? '').trim();
  const asked = String(body?.chatId ?? '').trim();
  if (!question) return new Response('Nothing asked', { status: 400 });

  // An unknown or someone else's chat id starts a new chat rather than failing:
  // turnsIn returns null unless it is his.
  const history: DeskTurn[] = asked ? (await turnsIn(doctor.id, asked)) ?? [] : [];
  const chatId = asked && history.length ? asked : (await startChat(doctor.id, question)).id;

  await addTurn(chatId, 'user', question);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      // The browser needs the chat id before the answer, so a reload mid-answer
      // lands in the right conversation.
      send({ type: 'chat', chatId });

      let text = '';
      let navigate: string | undefined;

      try {
        for await (const event of streamDesk({ id: doctor.id, name: doctor.name }, question, history)) {
          if (event.type === 'delta') text += event.text;
          if (event.type === 'done') { text = event.text || text; navigate = event.navigate; }
          send(event);
        }
      } catch (err) {
        console.error('desk stream failed', err);
        send({ type: 'error', text: 'That did not go through. Try again.' });
      }

      controller.close();

      // After the response, so saving never delays the last word reaching him.
      if (text.trim()) after(addTurn(chatId, 'assistant', text.trim(), navigate));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx and some proxies hold a response back until it is complete, which
      // would undo the entire point of this route.
      'X-Accel-Buffering': 'no',
    },
  });
}
