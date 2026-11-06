/**
 * The WhatsApp Cloud API, and only the parts this product uses.
 *
 * Nothing else in the codebase knows what WhatsApp is. The bot in lib/bot.ts
 * takes an inbound message and returns a reply; this file is the adapter, and
 * the dev simulator replaces it wholesale.
 *
 * Two rules of Meta's that shape the code:
 *   - free-form text is only allowed inside 24 hours of the patient's last
 *     message. Outside it, only an approved template.
 *   - the webhook must return 200 quickly or delivery is retried, which is why
 *     the route acknowledges first and answers in `after()`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

export const configured = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

/**
 * The clinic's number, in digits, for a patient to write to.
 *
 * This is what keeps message templates off the pilot's critical path. Meta only
 * allows free-form replies inside 24 hours of the patient's own last message,
 * and opening that window any other way needs an approved template. If the
 * patient starts the conversation from their own page, the window is already
 * open and every reply the bot sends is ordinary text.
 */
export const publicNumber = () =>
  (process.env.WHATSAPP_PUBLIC_NUMBER ?? '').replace(/\D/g, '') || null;

/** A chat with the clinic, with the patient's first message already written. */
export function askUrl(greeting: string) {
  const number = publicNumber();
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(greeting)}` : null;
}

export type Inbound = {
  channel: 'whatsapp';
  address: string;
  providerMessageId: string;
  displayName?: string;
  kind: 'text' | 'image' | 'document' | 'audio' | 'other';
  text?: string;
  mediaId?: string;
  mediaMime?: string;
};

/** Meta's subscription handshake. Constant-time, since it is a shared secret. */
export function verifyChallenge(params: URLSearchParams): string | null {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  const given = params.get('hub.verify_token');
  if (!expected || !given || params.get('hub.mode') !== 'subscribe') return null;
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return params.get('hub.challenge');
}

/**
 * Meta signs every delivery. Without this check the webhook is an open endpoint
 * that anyone can use to make our bot answer as if a patient had written in.
 */
export function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Deployed without a secret, every POST is trusted, and the webhook is an
    // open door: anyone who knows a patient's number can speak as them — ask
    // questions in their name, or reply "yes" to a lab read-back and write
    // values into their record. Unconfigured means closed, not open.
    if (process.env.NODE_ENV === 'production') {
      console.error('WHATSAPP_APP_SECRET is not set — refusing unverified webhook delivery');
      return false;
    }
    return true;                         // local development only
  }
  if (!header?.startsWith('sha256=')) return false;
  const mine = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(header.slice(7)), b = Buffer.from(mine);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Everything a delivery contains that we act on; statuses are ignored. */
export function parseInbound(payload: unknown): Inbound[] {
  const out: Inbound[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = payload as any;
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const name = value?.contacts?.[0]?.profile?.name;
      for (const m of value?.messages ?? []) {
        const base = {
          channel: 'whatsapp' as const,
          address: String(m.from ?? '').replace(/\D/g, ''),
          providerMessageId: String(m.id ?? ''),
          displayName: name,
        };
        if (m.type === 'text') {
          out.push({ ...base, kind: 'text', text: m.text?.body ?? '' });
        } else if (m.type === 'image' || m.type === 'document') {
          out.push({
            ...base, kind: m.type,
            text: m[m.type]?.caption ?? '',
            mediaId: m[m.type]?.id,
            mediaMime: m[m.type]?.mime_type,
          });
        } else {
          out.push({ ...base, kind: 'other', text: '' });
        }
      }
    }
  }
  return out.filter((m) => m.address && m.providerMessageId);
}

export async function sendText(to: string, body: string) {
  if (!configured()) return { skipped: 'not_configured' as const };
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: true },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('whatsapp send failed', res.status, json);
    return { error: json?.error?.message ?? `http ${res.status}` };
  }
  return { id: json?.messages?.[0]?.id as string | undefined };
}

/** Media arrives as an id; fetching it is two requests, both authenticated. */
export async function downloadMedia(mediaId: string) {
  if (!configured()) return null;
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth }).then((r) => r.json());
  if (!meta?.url) return null;
  const file = await fetch(meta.url, { headers: auth });
  if (!file.ok) return null;
  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    mime: (meta.mime_type as string) ?? 'image/jpeg',
  };
}
