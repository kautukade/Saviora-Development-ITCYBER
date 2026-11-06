'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { assign } from '@/lib/content';
import { requireDoctor } from '@/lib/auth';
import { db } from '@/lib/db';
import { patients } from '@/lib/schema';
import { phoneClash } from '@/lib/patients';
import { extractYouTubeId, slugify } from '@/lib/youtube';

/**
 * A cap, because a patient pays for every byte on mobile data and a doctor
 * filming on a phone will happily hand over a 400MB clip without thinking
 * about it.
 */
const MAX_VIDEO_BYTES = 120 * 1e6;

/** Puts an uploaded video in blob storage and hands back its URL. */
async function storeVideo(doctorId: string, file: File): Promise<{ url: string } | { error: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { error: 'Uploads are not switched on yet. Paste a YouTube link instead.' };
  }
  try {
    const { put } = await import('@vercel/blob');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-60);
    const stored = await put(`videos/${doctorId}/${Date.now()}-${safe}`, file, {
      access: 'public',
      contentType: file.type,
    });
    return { url: stored.url };
  } catch (err) {
    console.error('video upload failed', err);
    return { error: 'That upload did not go through. Try again.' };
  }
}

export type AddPatientState = { error?: string };

export async function addPatientAction(
  _prev: AddPatientState, formData: FormData,
): Promise<AddPatientState> {
  const doctor = await requireDoctor();

  const name = String(formData.get('name') ?? '').trim();
  // Normalised before anything else touches it. Meta delivers wa_id as
  // 919820012345, and lib/bot.ts links an inbound message to a patient by an
  // exact string match — so a number stored as 9820012345 means that patient's
  // messages never reach their own record, silently and forever.
  const digits = String(formData.get('phone') ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const language = String(formData.get('language') ?? 'hi');
  const mrn = String(formData.get('mrn') ?? '').trim() || null;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  if (!name) return { error: 'Enter the patient’s name.' };
  if (phone && phone.length < 11) {
    return { error: 'That number looks short. Ten digits, or include the country code.' };
  }

  // Two patients on one number is how the bot ends up answering from the wrong
  // person's material and filing blood results to the wrong record. It refuses
  // to guess when that happens, which leaves the patient with no bot at all —
  // so the collision is caught here, where a human is present to resolve it.
  const clash = await phoneClash(phone, doctor.id);
  if (clash) {
    return { error: (clash.mine ? `${clash.name} is` : 'Another clinic\'s patient is')
      + ' already registered with that number. WhatsApp cannot tell two people on'
      + ' one number apart — use a different number, or leave this one blank and'
      + ' send them their link another way.' };
  }

  await db.insert(patients).values({
    doctorId: doctor.id, name, phone: phone || null, language, mrn, notes,
  });
  revalidatePath('/patients');
  return {};
}

export type AssignState = { added?: number; error?: string };

export async function assignAction(
  _prev: AssignState, formData: FormData,
): Promise<AssignState> {
  const doctor = await requireDoctor();
  const patientId = String(formData.get('patientId') ?? '');

  // The patient must be this doctor's, checked here rather than trusted from
  // the form — a Server Action is reachable by direct POST.
  const [patient] = await db.select().from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.doctorId, doctor.id))).limit(1);
  if (!patient) return { error: 'Patient not found.' };

  const contentIds = formData.getAll('contentId').map(String);
  if (contentIds.length === 0) return { error: 'Choose something to send.' };

  // `assign` re-checks visibility, so another doctor's content cannot be
  // assigned even if its id is posted directly.
  const added = await assign(doctor.id, patient.id, contentIds, patient.language);
  revalidatePath(`/patients/${patient.id}`);
  return { added: added.length };
}

export type NewContentState = { error?: string };

/**
 * A doctor adding their own content. `ownerDoctorId` is always their own id —
 * never taken from the form — so nothing here can create Saviora-owned content
 * that every other doctor would then see.
 */
export async function addContentAction(
  _prev: NewContentState, formData: FormData,
): Promise<NewContentState> {
  const doctor = await requireDoctor();

  const kind = String(formData.get('kind') ?? 'text');
  const title = String(formData.get('title') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim() || null;
  const language = String(formData.get('language') ?? 'en');
  const estMinutes = Number(formData.get('estMinutes') ?? 4);
  const bodyMd = String(formData.get('bodyMd') ?? '').trim() || null;
  const videoInput = String(formData.get('videoId') ?? '').trim();
  const upload = formData.get('videoFile');
  const file = upload instanceof File && upload.size > 0 ? upload : null;

  if (!title) return { error: 'Give it a title — this is what the patient sees.' };
  if (kind === 'text' && !bodyMd) return { error: 'Write or paste the text to send.' };
  if (kind === 'video' && !videoInput && !file) {
    return { error: 'Paste a link, or choose a video file to upload.' };
  }

  // A pasted link is taken as YouTube. Anything else the doctor has — a clip
  // filmed in clinic, a reel saved from Instagram — is uploaded and played
  // directly, so getting it to a patient does not require a YouTube account.
  let videoId: string | null = null;
  let videoUrl: string | null = null;

  if (kind === 'video' && videoInput) {
    videoId = extractYouTubeId(videoInput);
    if (!videoId) return { error: 'That does not look like a YouTube link or id.' };
  } else if (kind === 'video' && file) {
    if (!file.type.startsWith('video/')) {
      return { error: 'That is not a video file. MP4 is the safest to use.' };
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return { error: `That file is ${Math.round(file.size / 1e6)}MB. Keep it under ${MAX_VIDEO_BYTES / 1e6}MB — patients watch on mobile data.` };
    }
    const stored = await storeVideo(doctor.id, file);
    if ('error' in stored) return stored;
    videoUrl = stored.url;
  }

  const slug = `${slugify(title)}-${Date.now().toString(36).slice(-4)}`;
  const { content: contentTable, contentVersions } = await import('@/lib/schema');

  const [row] = await db.insert(contentTable).values({
    ownerDoctorId: doctor.id,
    kind, slug, topic: null, estMinutes: Number.isFinite(estMinutes) ? estMinutes : 4,
    sortOrder: 100,
  }).returning();

  await db.insert(contentVersions).values({
    contentId: row.id, language, title, summary, bodyMd, videoId, videoUrl,
  });

  revalidatePath('/library');
  redirect('/library');
}
