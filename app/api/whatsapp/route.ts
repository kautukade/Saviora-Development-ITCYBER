/**
 * Meta's webhook. Two jobs: prove we own the endpoint, and take deliveries.
 *
 * The POST returns 200 before doing any work. Meta retries anything slow or
 * failed, and a retry means a patient is answered twice — so acknowledgement
 * and processing are deliberately separated by `after()`.
 */

import { after, NextResponse } from 'next/server';

import { handleInbound } from '@/lib/bot';
import { parseInbound, verifyChallenge, verifySignature } from '@/lib/whatsapp';

// The model call happens after the response is sent, but still inside the
// invocation, so the function must be allowed to live long enough to finish.
export const maxDuration = 60;

export async function GET(request: Request) {
  const challenge = verifyChallenge(new URL(request.url).searchParams);
  if (challenge === null) return new NextResponse('forbidden', { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'))) {
    return new NextResponse('bad signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  const inbound = parseInbound(payload);
  after(async () => {
    for (const m of inbound) {
      try {
        await handleInbound({
          channel: 'whatsapp',
          address: m.address,
          text: m.text ?? '',
          kind: m.kind === 'audio' || m.kind === 'other' ? 'other' : m.kind,
          mediaId: m.mediaId,
          providerMessageId: m.providerMessageId,
          displayName: m.displayName,
        });
      } catch (err) {
        // A thrown handler must not stop the rest of the batch, and must never
        // reach Meta as a non-200 — that would replay the whole delivery.
        console.error('inbound failed', m.providerMessageId, err);
      }
    }
  });

  return NextResponse.json({ received: inbound.length });
}
