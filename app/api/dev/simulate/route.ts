/**
 * The bot without WhatsApp.
 *
 * The whole conversation loop is channel-agnostic, so this drives the real
 * handler — the same rails, the same model call, the same rows written — and
 * hands back what the patient would have received. It is how the bot is built
 * and tested before Meta approval exists.
 *
 * Guarded: available in development, and in production only when SIMULATE_KEY
 * is set and presented.
 */

import { NextResponse } from 'next/server';

import { handleInbound } from '@/lib/bot';

export const maxDuration = 60;

function allowed(request: Request) {
  const key = process.env.SIMULATE_KEY;
  if (key) return request.headers.get('x-simulate-key') === key;
  return process.env.NODE_ENV !== 'production';
}

export async function POST(request: Request) {
  if (!allowed(request)) return new NextResponse('not found', { status: 404 });

  const body = await request.json().catch(() => null);
  const address = String(body?.address ?? '').trim();
  const text = String(body?.text ?? '');
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

  // A photographed report arrives base64-encoded, so the whole lab flow can be
  // driven from a script with no WhatsApp media endpoint in the way.
  const media = body?.mediaBase64
    ? { bytes: Buffer.from(String(body.mediaBase64), 'base64'), mime: String(body.mediaMime ?? 'image/jpeg') }
    : undefined;

  const handled = await handleInbound({
    channel: body?.channel === 'whatsapp' ? 'whatsapp' : 'console',
    address,
    text,
    kind: media ? (body?.kind ?? 'image') : (body?.kind ?? 'text'),
    media,
    providerMessageId: body?.providerMessageId,
    displayName: body?.displayName,
  });
  return NextResponse.json(handled);
}
