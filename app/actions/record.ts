'use server';

import { and, eq } from 'drizzle-orm';

import { requireDoctor } from '@/lib/auth';
import { db } from '@/lib/db';
import { askAboutPatient, type Turn } from '@/lib/record';
import { patients } from '@/lib/schema';

export type AskState = {
  turns: Turn[];
  error?: string;
};

/**
 * The doctor asking about their own patient.
 *
 * Scoped through the patient to the signed-in doctor, like every other action
 * here — a patient id posted directly from another clinic resolves to nothing.
 */
export async function askAction(prev: AskState, formData: FormData): Promise<AskState> {
  const doctor = await requireDoctor();
  const patientId = String(formData.get('patientId') ?? '');
  const question = String(formData.get('question') ?? '').trim();
  if (!question) return { turns: prev.turns };

  const [patient] = await db.select({ id: patients.id }).from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.doctorId, doctor.id))).limit(1);
  if (!patient) return { turns: prev.turns, error: 'Patient not found.' };

  const asked: Turn[] = [...prev.turns, { role: 'user', text: question }];
  const answer = await askAboutPatient(patient.id, question, prev.turns);
  if (answer.error) return { turns: asked, error: answer.error };

  return { turns: [...asked, { role: 'assistant', text: answer.text }] };
}
