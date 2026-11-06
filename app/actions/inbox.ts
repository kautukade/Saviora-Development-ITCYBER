'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { requireDoctor } from '@/lib/auth';
import { sendFromDoctor } from '@/lib/bot';
import { draftReply } from '@/lib/draft';
import { CANNOT_REPLY } from '@/lib/inbox';
import { db } from '@/lib/db';
import { escalations, patients } from '@/lib/schema';

/**
 * Close an item. Scoped through the patient to the signed-in doctor, so an id
 * from someone else's inbox does nothing however it is posted.
 */
export async function markHandled(formData: FormData) {
  const doctor = await requireDoctor();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? 'answered');
  if (!id || !['seen', 'answered'].includes(status)) return;

  const mine = await db.select({ id: patients.id }).from(patients)
    .where(eq(patients.doctorId, doctor.id));
  if (!mine.length) return;

  await db.update(escalations)
    .set({ status, repliedAt: status === 'answered' ? new Date() : null })
    .where(and(
      eq(escalations.id, id),
      inArray(escalations.patientId, mine.map((p) => p.id)),
    ));
  revalidatePath('/');
}

export type ReplyState = { error?: string; sent?: boolean } | null;

/**
 * The doctor answering an escalation in their own words.
 *
 * The reply is recorded against the conversation only if it was actually
 * delivered, and the escalation is closed only then — a doctor must never be
 * shown "answered" for a message the patient never received.
 */
export async function replyAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const doctor = await requireDoctor();
  const id = String(formData.get('id') ?? '');
  const text = String(formData.get('text') ?? '').trim();
  if (!id || !text) return { error: 'Write something first.' };

  // Scope through the patient, as everywhere else: an id posted directly from
  // another doctor's inbox resolves to nothing.
  const [row] = await db.select({ patientId: escalations.patientId })
    .from(escalations)
    .innerJoin(patients, eq(patients.id, escalations.patientId))
    .where(and(eq(escalations.id, id), eq(patients.doctorId, doctor.id)))
    .limit(1);
  if (!row) return { error: 'Not found.' };

  const sent = await sendFromDoctor(row.patientId, text);
  if (!sent.ok) return { error: CANNOT_REPLY[sent.reason ?? 'failed'] ?? CANNOT_REPLY.failed };

  await db.update(escalations)
    .set({ status: 'answered', reply: text, repliedAt: new Date() })
    .where(eq(escalations.id, id));
  revalidatePath('/');
  return { sent: true };
}

export type DraftState = { text?: string; error?: string } | null;

/**
 * Ask for a suggested reply. Nothing is sent — it lands in the box for the
 * doctor to change or throw away, and only his send reaches the patient.
 */
export async function draftAction(_prev: DraftState, formData: FormData): Promise<DraftState> {
  const doctor = await requireDoctor();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Not found.' };

  const [row] = await db.select({ patientId: escalations.patientId, text: escalations.text })
    .from(escalations)
    .innerJoin(patients, eq(patients.id, escalations.patientId))
    .where(and(eq(escalations.id, id), eq(patients.doctorId, doctor.id)))
    .limit(1);
  if (!row) return { error: 'Not found.' };

  const draft = await draftReply(row.patientId, row.text);
  return draft.error ? { error: draft.error } : { text: draft.text };
}
