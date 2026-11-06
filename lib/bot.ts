/**
 * What happens when a patient sends a message — on any channel.
 *
 * This is the product loop. The WhatsApp webhook and the dev simulator both
 * call `handleInbound` and nothing else; the difference between them is only
 * how the reply is delivered.
 *
 * The order is deliberate and each step is a gate on the next:
 *
 *   0. A delivery we have already handled is dropped. Meta retries, and a
 *      retry must not produce a second answer.
 *   1. STOP, before anything else touches the message. Someone opting out must
 *      not have their message screened, answered, or filed as a question.
 *   2. The emergency screen. Deterministic, no model, no exceptions.
 *   3. An address we cannot scope to a patient gets a holding reply and no
 *      answer — we never answer someone whose material we cannot identify.
 *   4. A grounded answer from that doctor's material, or an escalation.
 */

import { and, desc, eq } from 'drizzle-orm';

import { answerFromCorpus, assistantEnabled, type Turn } from './claude';
import { t } from './copy';
import { corpusFor } from './documents';
import { db } from './db';
import { classify } from './intent';
import { awaitingConfirmation, confirm, intake, reject } from './labs';
import { withPhone } from './patients';
import { emergencyMessage, needsDoctor, screen } from './redflags';
import { conversations, doctors, escalations, messages, patients } from './schema';
import { configured as whatsappConfigured, downloadMedia, sendText } from './whatsapp';

const STOP_WORDS = new Set(['stop', 'unsubscribe', 'band', 'बंद', 'रोको', 'रोकें']);
const START_WORDS = new Set(['start', 'शुरू', 'चालू']);

export type InboundMessage = {
  channel: 'whatsapp' | 'console';
  address: string;
  text: string;
  kind?: 'text' | 'image' | 'document' | 'audio' | 'other';
  providerMessageId?: string;
  displayName?: string;
  /** WhatsApp hands over an id to fetch; the simulator hands over the bytes. */
  mediaId?: string;
  media?: { bytes: Buffer; mime: string };
};

export type Handled = {
  outcome: 'duplicate' | 'stopped' | 'resumed' | 'ignored' | 'emergency'
         | 'unlinked' | 'answered' | 'escalated' | 'unsupported'
         | 'acknowledged' | 'asked_for_doctor'
         | 'report_read' | 'report_retake' | 'report_unreadable'
         | 'report_nothing_found' | 'report_too_big' | 'report_failed'
         | 'result_confirmed' | 'result_rejected';
  reply?: string;
  escalated?: boolean;
  reason?: string;
  citations?: { title: string; quote: string }[];
};

/* ------------------------------------------------------------- plumbing */

async function conversationFor(inbound: InboundMessage) {
  const [existing] = await db.select().from(conversations).where(and(
    eq(conversations.channel, inbound.channel),
    eq(conversations.address, inbound.address),
  ));
  if (existing) return existing;

  // An unknown number may still be a patient the doctor has already added.
  //
  // Only when exactly one patient has it. Families share a phone — a husband
  // and wife, a parent and child, one handset for the household — and picking
  // whichever row the database returned first would answer from the wrong
  // person's material and file their blood results to the wrong record. An
  // ambiguous number is left unlinked and answered by a human.
  const known = await withPhone(inbound.address);
  const only = known.length === 1 ? known[0] : null;

  const [created] = await db.insert(conversations).values({
    channel: inbound.channel,
    address: inbound.address,
    patientId: only?.id ?? null,
    displayName: inbound.displayName ?? null,
    optInState: only ? 'opted_in' : 'pending',
  }).returning();
  return created;
}

/** WhatsApp's 24-hour window opens on every inbound message. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function send(
  conv: typeof conversations.$inferSelect,
  text: string,
  meta: Record<string, unknown> = {},
  { bypassOptOut = false } = {},
) {
  if (!bypassOptOut && (conv.optInState === 'stopped' || conv.optInState === 'blocked')) {
    return null;
  }
  const sent = conv.channel === 'whatsapp'
    ? await sendText(conv.address, text)
    : { skipped: 'console' as const };

  const [row] = await db.insert(messages).values({
    conversationId: conv.id,
    direction: 'out',
    text,
    providerMessageId: 'id' in sent ? sent.id ?? null : null,
    status: 'error' in sent ? 'failed' : 'sent',
    meta: { ...meta, ...('skipped' in sent ? { skipped: sent.skipped } : {}),
            ...('error' in sent ? { error: sent.error } : {}) },
    // Stamped here, not by the database: `now()` is transaction time, so a
    // reply written in the same transaction as the question it answers can
    // sort before it.
    createdAt: new Date(),
  }).returning({ id: messages.id });
  return row.id;
}

async function escalate(
  patientId: string,
  kind: string,
  text: string,
  redFlag = false,
) {
  const [row] = await db.insert(escalations)
    .values({ patientId, kind, text, redFlag, createdAt: new Date() })
    .returning({ id: escalations.id });
  return row.id;
}

/**
 * History for the model, oldest first — and truncated at the last emergency.
 *
 * An emergency reply is fixed text the model never wrote. Left in the history
 * it colours everything after it: in the prototype a later question about a
 * medicine came back telling the patient to contact emergency services. Filtering
 * the fixed text alone was not enough, because the model's own paraphrase of it
 * survived — so everything up to and including the emergency is dropped.
 */
async function historyFor(conversationId: string): Promise<Turn[]> {
  const rows = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt)).limit(12);
  rows.reverse();

  const lastEmergency = rows.map((m) => !!(m.meta as { redFlags?: unknown })?.redFlags)
    .lastIndexOf(true);
  const usable = lastEmergency === -1 ? rows : rows.slice(lastEmergency + 1);

  return usable
    .filter((m) => m.text?.trim())
    .map((m) => ({ role: m.direction === 'in' ? 'user' as const : 'assistant' as const, text: m.text! }));
}

/**
 * The doctor answering, in their own words, through the app.
 *
 * Three reasons this can fail, and the doctor is told which one rather than
 * being left to wonder whether their patient got it:
 *
 *   - the patient has never written in, so there is no thread and no window
 *   - they opted out, and STOP means stop, including for the doctor
 *   - Meta's 24-hour window has closed, and free-form text is refused at the
 *     API. Only an approved template can reopen it, and we have none.
 */
export async function sendFromDoctor(
  patientId: string,
  text: string,
): Promise<{ ok: boolean; reason?: 'no_conversation' | 'opted_out' | 'window_closed' | 'not_configured' | 'failed' }> {
  const body = text.trim();
  if (!body) return { ok: false, reason: 'failed' };

  const [conv] = await db.select().from(conversations)
    .where(eq(conversations.patientId, patientId)).limit(1);
  if (!conv) return { ok: false, reason: 'no_conversation' };
  if (conv.optInState === 'stopped' || conv.optInState === 'blocked') {
    return { ok: false, reason: 'opted_out' };
  }
  if (conv.channel === 'whatsapp') {
    if (!conv.windowExpiresAt || conv.windowExpiresAt.getTime() < Date.now()) {
      return { ok: false, reason: 'window_closed' };
    }
    if (!whatsappConfigured()) return { ok: false, reason: 'not_configured' };
  }

  const id = await send(conv, body, { fromDoctor: true });
  return id ? { ok: true } : { ok: false, reason: 'failed' };
}

/** Whether a free-form reply would reach this patient right now, and why not. */
export async function replyStatus(patientId: string) {
  const [conv] = await db.select().from(conversations)
    .where(eq(conversations.patientId, patientId)).limit(1);
  if (!conv) return { canReply: false, reason: 'no_conversation' as const };
  if (conv.optInState === 'stopped' || conv.optInState === 'blocked') {
    return { canReply: false, reason: 'opted_out' as const };
  }
  if (conv.channel !== 'whatsapp') return { canReply: true, reason: null };
  const open = conv.windowExpiresAt && conv.windowExpiresAt.getTime() > Date.now();
  if (!open) return { canReply: false, reason: 'window_closed' as const, lastInboundAt: conv.lastInboundAt };
  if (!whatsappConfigured()) return { canReply: false, reason: 'not_configured' as const };
  return { canReply: true, reason: null, windowExpiresAt: conv.windowExpiresAt };
}

/* ----------------------------------------------------------- the loop */

export async function handleInbound(inbound: InboundMessage): Promise<Handled> {
  const conv = await conversationFor(inbound);
  const text = (inbound.text ?? '').trim();

  // 0. Meta retries deliveries. Answering twice is worse than answering late.
  if (inbound.providerMessageId) {
    const [seen] = await db.select({ id: messages.id }).from(messages)
      .where(eq(messages.providerMessageId, inbound.providerMessageId)).limit(1);
    if (seen) return { outcome: 'duplicate' };
  }

  const history = await historyFor(conv.id);

  await db.insert(messages).values({
    conversationId: conv.id,
    direction: 'in',
    kind: inbound.kind ?? 'text',
    text,
    providerMessageId: inbound.providerMessageId ?? null,
    status: 'received',
    createdAt: new Date(),
  });
  await db.update(conversations).set({
    lastInboundAt: new Date(),
    windowExpiresAt: new Date(Date.now() + WINDOW_MS),
    displayName: conv.displayName ?? inbound.displayName ?? null,
  }).where(eq(conversations.id, conv.id));

  const patient = conv.patientId
    ? (await db.select().from(patients).where(eq(patients.id, conv.patientId)))[0]
    : null;
  const lang = patient?.language ?? 'en';
  const word = text.toLowerCase().split(/\s+/)[0] ?? '';

  // 1. Opting out, before anything else.
  if (STOP_WORDS.has(text.toLowerCase()) || STOP_WORDS.has(word)) {
    await db.update(conversations).set({ optInState: 'stopped' })
      .where(eq(conversations.id, conv.id));
    // The one message that ignores the opt-out, because it is the confirmation
    // of it, and the last thing they hear from us.
    await send(conv, t('stopped', lang), { optOut: true }, { bypassOptOut: true });
    return { outcome: 'stopped', reply: t('stopped', lang) };
  }
  if (START_WORDS.has(word) && conv.optInState !== 'opted_in') {
    await db.update(conversations).set({ optInState: 'opted_in' })
      .where(eq(conversations.id, conv.id));
    await send({ ...conv, optInState: 'opted_in' }, t('resumed', lang));
    return { outcome: 'resumed', reply: t('resumed', lang) };
  }
  if (conv.optInState === 'stopped' || conv.optInState === 'blocked') {
    // Their message is kept — it is their record — but nothing is processed.
    // No screen, no model call, no question filed, no reply that would be
    // refused at the send step anyway.
    return { outcome: 'ignored' };
  }

  // 2. The emergency rail. The model is never reached.
  const flags = screen(text);
  if (flags.length) {
    const reply = emergencyMessage(lang);
    const escalationId = patient ? await escalate(patient.id, 'red_flag', text, true) : null;
    await send(conv, reply, { redFlags: flags, escalationId });
    return { outcome: 'emergency', reply, escalated: true, reason: 'red_flag' };
  }

  // 3. Someone we cannot scope. A holding reply, and never an answer.
  if (!patient) {
    const shared = (await withPhone(inbound.address)).length > 1;
    const reply = t(shared ? 'shared' : 'holding', lang);
    await send(conv, reply, { unlinked: true, shared });
    return { outcome: 'unlinked', reply };
  }

  // 4. A photographed report. Nothing is saved yet — the values come back for
  //    the patient to confirm first.
  const kind = inbound.kind ?? 'text';
  if (kind === 'image' || kind === 'document') {
    const media = inbound.media
      ?? (inbound.mediaId ? await downloadMedia(inbound.mediaId) : null);
    if (!media) {
      const reply = t('retake', lang);
      await send(conv, reply);
      return { outcome: 'report_failed', reply };
    }
    const read = await intake(patient, media.bytes, media.mime);
    await send(conv, read.reply, { resultId: read.result?.id ?? null, outcome: read.outcome });
    return { outcome: read.outcome as Handled['outcome'], reply: read.reply };
  }

  if (!text) {
    const reply = t('notText', lang);
    await send(conv, reply);
    return { outcome: 'unsupported', reply };
  }

  // 5. What is this message for?
  //
  //    Deliberately after the emergency screen, which is deterministic and runs
  //    with no model in the loop: "नहीं, मुझे सीने में दर्द है" is a red flag
  //    first and a correction to a read-back second.
  const pending = await awaitingConfirmation(patient.id);
  const { intent, by } = await classify(text, { awaitingReadback: !!pending });

  // A phrasing the STOP word list does not cover — "please don't message me
  // again". The explicit STOP above is still checked first and still never
  // depends on a model call.
  if (intent === 'opt_out') {
    await db.update(conversations).set({ optInState: 'stopped' })
      .where(eq(conversations.id, conv.id));
    await send(conv, t('stopped', lang), { optOut: true, intent, by }, { bypassOptOut: true });
    return { outcome: 'stopped', reply: t('stopped', lang) };
  }

  if (pending && intent === 'confirm_result') {
    const done = await confirm(pending, patient);
    await send(conv, done.reply, { resultId: pending.id, written: done.written, intent, by });
    return { outcome: 'result_confirmed', reply: done.reply, escalated: done.escalated };
  }
  if (pending && intent === 'reject_result') {
    const reply = await reject(pending, patient);
    await send(conv, reply, { resultId: pending.id, intent, by });
    return { outcome: 'result_rejected', reply, escalated: true };
  }

  // "ok thanks" needs a short reply, not a grounded answer and not a place in
  // the doctor's inbox.
  if (intent === 'smalltalk') {
    const reply = t('acknowledged', lang);
    await send(conv, reply, { intent, by });
    return { outcome: 'acknowledged', reply };
  }

  // They want a person. Answering well would be missing the point.
  if (intent === 'wants_doctor') {
    const reply = t('askedForDoctor', lang);
    const wantsDoctorId = await escalate(patient.id, 'wants_doctor', text);
    await send(conv, reply, { intent, by, escalationId: wantsDoctorId });
    return { outcome: 'asked_for_doctor', reply, escalated: true };
  }

  // A question about starting or stopping a medicine reaches the doctor even
  // when the assistant answers it well — the answer explains, the doctor decides.
  const medicine = needsDoctor(text);
  let escalationId = medicine.length ? await escalate(patient.id, 'medicine', text) : null;

  if (!assistantEnabled()) {
    const reply = t('unavailable', lang);
    escalationId ??= await escalate(patient.id, 'out_of_scope', text);
    await send(conv, reply, { escalationId });
    return { outcome: 'escalated', reply, escalated: true, reason: 'disabled' };
  }

  // 4. The grounded answer.
  const [doctor] = await db.select().from(doctors).where(eq(doctors.id, patient.doctorId));
  const answer = await answerFromCorpus({
    // "Dr Naik", not "Naik" — how the patient refers to them, and how the
    // assistant should. Names already carrying the title are left alone.
    doctorName: doctor
      ? (/^dr\b/i.test(doctor.name) ? doctor.name : `Dr ${doctor.name}`)
      : 'your doctor',
    patientName: patient.name.split(' ')[0],
    language: lang,
    sources: await corpusFor(patient),
    history,
    question: text,
  });

  // What the patient actually receives.
  //
  // `sentinel` is the model deliberately declining, in the patient's own
  // language — that sentence is worth sending. Every other escalation means
  // the answer came from somewhere we cannot point to in the doctor's
  // material, so it is withheld and replaced with the fixed line. Sending it
  // anyway would make the citation gate decorative.
  const trustworthy = !answer.escalate || answer.reason === 'sentinel';
  const reply = trustworthy && answer.text ? answer.text : t('escalated', lang);

  if (answer.escalate && escalationId === null) {
    escalationId = await escalate(patient.id, 'out_of_scope', text);
  }
  await send(conv, reply, {
    escalationId, intent, by,
    model: answer.model, usage: answer.usage, reason: answer.reason,
    escalated: answer.escalate, citations: answer.citations,
    // Kept for the doctor, not the patient: what the bot would have said, and
    // why it was held back.
    ...(trustworthy ? {} : { withheld: answer.text || null }),
  });

  return {
    outcome: answer.escalate ? 'escalated' : 'answered',
    reply,
    escalated: answer.escalate,
    reason: answer.reason,
    citations: answer.citations,
  };
}
