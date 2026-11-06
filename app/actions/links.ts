'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireDoctor } from '@/lib/auth';
import { assignedTo } from '@/lib/content';
import { db } from '@/lib/db';
import { issueLink, revokeLink, whatsappHandoff } from '@/lib/links';
import { patientLinks, patients } from '@/lib/schema';

async function ownedPatient(patientId: string) {
  const doctor = await requireDoctor();
  const [patient] = await db.select().from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.doctorId, doctor.id))).limit(1);
  return patient ? { doctor, patient } : null;
}

export type LinkState = { url?: string; whatsapp?: string; expiresAt?: string; error?: string };

export async function issueLinkAction(
  _prev: LinkState, formData: FormData,
): Promise<LinkState> {
  const owned = await ownedPatient(String(formData.get('patientId') ?? ''));
  if (!owned) return { error: 'Patient not found.' };

  const link = await issueLink(owned.patient.id);
  // Name what was actually sent. "Some information has been shared with you" is
  // a reason to assume spam; "Dr Naik has sent you Sick-day rules" is a reason
  // to tap.
  const given = await assignedTo(owned.patient.id, owned.patient.language);

  revalidatePath(`/patients/${owned.patient.id}`);
  return {
    url: link.url,
    whatsapp: whatsappHandoff(owned.patient.phone, owned.doctor.name, link.url, {
      patientName: owned.patient.name,
      language: owned.patient.language,
      titles: given.map((g) => g.title),
    }),
    expiresAt: link.expiresAt.toISOString(),
  };
}

export async function revokeLinkAction(formData: FormData) {
  const linkId = String(formData.get('linkId') ?? '');
  const [link] = await db.select().from(patientLinks)
    .where(eq(patientLinks.id, linkId)).limit(1);
  if (!link) return;

  const owned = await ownedPatient(link.patientId);
  if (!owned) return;

  await revokeLink(linkId);
  revalidatePath(`/patients/${link.patientId}`);
}
