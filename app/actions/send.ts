'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireDoctor } from '@/lib/auth';
import { assign, library } from '@/lib/content';
import { db } from '@/lib/db';
import { issueLink, whatsappHandoff } from '@/lib/links';
import { patients } from '@/lib/schema';

export type SendState = {
  sent?: { count: number; patient: string; url: string; whatsapp: string | null };
  error?: string;
};

/**
 * Send educational material to one patient.
 *
 * "Send" here means what it says, which the old assign flow did not: the
 * material is put on their list AND a link is issued AND the doctor is handed
 * the WhatsApp message to send. Stopping after the first of those is how a
 * doctor comes to believe a patient has something they have never been given.
 */
export async function sendAction(_prev: SendState, formData: FormData): Promise<SendState> {
  const doctor = await requireDoctor();
  const patientId = String(formData.get('patientId') ?? '');
  const language = String(formData.get('language') ?? '');
  const contentIds = formData.getAll('contentId').map(String).filter(Boolean);

  if (!patientId) return { error: 'Choose who it is for.' };
  if (!contentIds.length) return { error: 'Choose what to send.' };
  if (!['en', 'hi'].includes(language)) return { error: 'Choose a language.' };

  const [patient] = await db.select().from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.doctorId, doctor.id))).limit(1);
  if (!patient) return { error: 'Patient not found.' };

  const added = await assign(doctor.id, patient.id, contentIds, language);
  const link = await issueLink(patient.id);

  // The message names what was sent, in the language it was sent in.
  const titles = (await library(doctor.id, language))
    .filter((item) => contentIds.includes(item.id))
    .map((item) => item.title);

  revalidatePath(`/patients/${patient.id}`);
  return {
    sent: {
      // Anything already on their list is not sent twice, and saying "4" when
      // one was a repeat would be a small lie about what they now have.
      count: added.length,
      patient: patient.name,
      url: link.url,
      whatsapp: patient.phone
        ? whatsappHandoff(patient.phone, doctor.name, link.url, {
            patientName: patient.name, language, titles,
          })
        : null,
    },
  };
}
