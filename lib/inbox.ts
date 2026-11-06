/**
 * What the doctor is waiting on.
 *
 * Everything the bot could not or would not answer, scoped to this doctor's
 * own patients. The list is the product's promise to the patient — a question
 * the assistant refused is only safe if it actually reaches a person.
 */

import { and, desc, eq, gte, inArray, ne, or } from 'drizzle-orm';

import { db } from './db';
import { conversations, escalations, messages, patients } from './schema';

export type InboxItem = {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  kind: string;
  redFlag: boolean;
  text: string;
  status: string;
  at: Date;
  /** What the doctor themselves sent back, once they have. */
  reply: string | null;
  repliedAt: Date | null;
  /** What the assistant said, and what it held back — the doctor sees both. */
  botReply: string | null;
  withheld: string | null;
  reason: string | null;
};

/**
 * Why a reply cannot be delivered, in one place. This used to exist twice —
 * once in the action and once in the page — with different wording, so the
 * doctor read one sentence before typing and a different one after.
 */
export const CANNOT_REPLY: Record<string, string> = {
  no_conversation: 'They have not written in yet, so there is nothing to reply into. Send them their link and ask them to message the clinic.',
  opted_out: 'They sent STOP. Nothing can be sent until they send START.',
  window_closed: 'Their 24-hour WhatsApp window has closed. Call them, or wait for them to write again.',
  not_configured: 'WhatsApp is not connected yet.',
  failed: 'That did not send. Try again, or reach them another way.',
};

/** Kinds whose `text` is the patient's own message rather than a note of ours. */
export const VERBATIM = new Set(['red_flag', 'medicine', 'out_of_scope', 'wants_doctor']);

/** The reason the assistant gave up, in words a doctor can act on. */
export const REASONS: Record<string, string> = {
  red_flag: 'Emergency wording — the patient was told to seek care',
  result: 'A confirmed value needs your attention',
  unreadable: 'The report photo could not be read',
  wants_doctor: 'They asked to speak to you',
  out_of_scope: 'Not in your material',
  sentinel: 'Not in your material',
  uncited: 'The assistant could not point to your material for its answer — held back',
  refusal: 'The assistant declined to answer',
  no_corpus: 'Nothing in your library to answer from',
  disabled: 'The assistant was switched off',
  error: 'The assistant failed to respond',
  medicine: 'About starting or stopping a medicine',
};

export async function inboxFor(doctorId: string, { open = true } = {}): Promise<InboxItem[]> {
  const mine = await db.select({ id: patients.id, name: patients.name, phone: patients.phone })
    .from(patients).where(eq(patients.doctorId, doctorId));
  if (!mine.length) return [];
  const byId = new Map(mine.map((p) => [p.id, p]));

  // Answered items stay for a few hours rather than vanishing the moment the
  // doctor presses send. Watching a card disappear is not confirmation that
  // anything was delivered, and their own words are worth seeing next to the
  // question they answered.
  const linger = new Date(Date.now() - 12 * 3600_000);

  // The predicate goes in SQL, before the limit. Filtering after it meant a
  // day of answered items could push still-open ones off the end.
  const rows = await db.select().from(escalations)
    .where(and(
      inArray(escalations.patientId, [...byId.keys()]),
      open
        ? or(ne(escalations.status, 'answered'), gte(escalations.repliedAt, linger))
        : undefined,
    ))
    .orderBy(desc(escalations.createdAt))
    .limit(150);

  // The reply the patient actually received for each escalation, matched by the
  // id the bot stamped on it. An earlier version paired them by timestamp and
  // showed a doctor an emergency question next to an unrelated answer — the two
  // are written milliseconds apart and in an order that varies by branch.
  const replies = new Map<string, typeof messages.$inferSelect>();
  for (const row of await db.select().from(messages)
    .where(eq(messages.direction, 'out'))
    .orderBy(desc(messages.createdAt)).limit(400)) {
    const id = (row.meta as { escalationId?: string })?.escalationId;
    if (id && !replies.has(id)) replies.set(id, row);
  }

  const items: InboxItem[] = [];
  for (const e of rows) {
    const p = byId.get(e.patientId)!;
    const reply = replies.get(e.id);
    const meta = (reply?.meta ?? {}) as { withheld?: string; reason?: string };
    const botReply = reply?.text ?? null;
    const withheld = meta.withheld ?? null;
    const reason = meta.reason ?? null;
    items.push({
      id: e.id, patientId: e.patientId, patientName: p.name, patientPhone: p.phone,
      kind: e.kind, redFlag: e.redFlag, text: e.text, status: e.status,
      at: e.createdAt, reply: e.reply, repliedAt: e.repliedAt, botReply, withheld,
      // Why it was filed beats why the model stopped: a medicine question is
      // "about starting or stopping a medicine" even when the assistant's own
      // reason for handing it over was that it wasn't in the material.
      reason: e.kind === 'out_of_scope' ? (reason ?? e.kind) : e.kind,
    });
  }

  // Anything still open comes first, red flags ahead of the rest regardless of
  // age; answered items settle underneath, newest first.
  const openFirst = (i: InboxItem) => (i.status === 'answered' ? 1 : 0);
  return items.sort((a, b) =>
    openFirst(a) - openFirst(b)
    || Number(b.redFlag) - Number(a.redFlag)
    || b.at.getTime() - a.at.getTime());
}

export async function threadFor(patientId: string, limit = 40) {
  const [conv] = await db.select().from(conversations)
    .where(eq(conversations.patientId, patientId)).limit(1);
  if (!conv) return { conversation: null, messages: [] };
  const rows = await db.select().from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(desc(messages.createdAt)).limit(limit);
  rows.reverse();
  return { conversation: conv, messages: rows };
}

/* ------------------------------------------------------------ the updates */

export type Updates = {
  /** A patient describing something that should not wait, or a dangerous value. */
  urgent: InboxItem[];
  /** Questions the assistant would not answer. These need a reply. */
  waiting: InboxItem[];
  /** Reports that arrived, and anything closed in the last day. */
  routine: InboxItem[];
  /** Answered from the doctor's own material, needing nothing from him. */
  handled: { patientId: string; patientName: string; text: string; at: Date; reply: string | null }[];
};

/**
 * Everything the patients have done, sorted by what it asks of the doctor.
 *
 * The split is the point. An escalation and a report arriving are both
 * "updates", and treating them the same is how a doctor learns to skim the
 * screen that holds the emergency.
 */
export async function patientUpdates(doctorId: string): Promise<Updates> {
  const items = await inboxFor(doctorId);

  const open = items.filter((i) => i.status !== 'answered');
  const urgent = open.filter((i) => i.redFlag);
  const waiting = open.filter((i) => !i.redFlag && i.kind !== 'unreadable');
  const routine = [
    ...open.filter((i) => i.kind === 'unreadable'),
    ...items.filter((i) => i.status === 'answered'),
  ];

  // What the assistant dealt with on its own, so he can see it was reasonable
  // without having to do anything about it.
  const mine = await db.select({ id: patients.id, name: patients.name })
    .from(patients).where(eq(patients.doctorId, doctorId));
  const byId = new Map(mine.map((p) => [p.id, p.name]));

  const handled: Updates['handled'] = [];
  if (mine.length) {
    const convs = await db.select().from(conversations)
      .where(inArray(conversations.patientId, [...byId.keys()]));

    if (convs.length) {
      const rows = await db.select().from(messages)
        .where(inArray(messages.conversationId, convs.map((c) => c.id)))
        .orderBy(desc(messages.createdAt))
        .limit(200);
      rows.reverse();

      const patientOf = new Map(convs.map((c) => [c.id, c.patientId]));
      for (let i = 0; i < rows.length; i++) {
        const m = rows[i];
        if (m.direction !== 'in' || !m.text?.trim()) continue;
        const next = rows[i + 1];
        const meta = (next?.meta ?? {}) as { escalated?: boolean; escalationId?: string; redFlags?: unknown; reason?: string };
        if (!next || next.direction !== 'out') continue;
        if (meta.escalated || meta.escalationId || meta.redFlags) continue;
        if (meta.reason !== 'answered') continue;

        const pid = patientOf.get(m.conversationId);
        if (!pid) continue;
        handled.push({
          patientId: pid, patientName: byId.get(pid) ?? '',
          text: m.text, at: m.createdAt, reply: next.text,
        });
      }
      handled.reverse();
    }
  }

  return { urgent, waiting, routine: routine.slice(0, 20), handled: handled.slice(0, 12) };
}
