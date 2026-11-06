'use server';

import { revalidatePath } from 'next/cache';

import { requireDoctor } from '@/lib/auth';
import { ingest, removeDocument } from '@/lib/documents';

export type UploadState = { error?: string; ok?: string } | null;

/**
 * A document the doctor's bot may answer from.
 *
 * It is theirs alone — `ownerDoctorId` is the signed-in doctor, never a value
 * from the form. Saviora's shared documents are seeded, not uploaded here.
 */
export async function uploadDocument(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const doctor = await requireDoctor();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file first.' };

  const result = await ingest({
    ownerDoctorId: doctor.id,
    title: String(formData.get('title') ?? '').trim() || file.name,
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  if (result.error) return { error: result.error };

  revalidatePath('/library');
  return { ok: 'Added. Your assistant can answer from it now.' };
}

export async function deleteDocument(formData: FormData) {
  const doctor = await requireDoctor();
  const id = String(formData.get('id') ?? '');
  if (id) await removeDocument(doctor.id, id);
  revalidatePath('/library');
}
