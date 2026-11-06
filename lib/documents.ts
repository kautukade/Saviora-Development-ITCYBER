/**
 * What the bot is allowed to answer from.
 *
 * Two sources, both doctor-approved, and nothing else exists as far as the
 * assistant is concerned:
 *
 *   1. Documents in the library visible to this patient's doctor — Saviora's
 *      (owner NULL) plus that doctor's own. Same rule as content.
 *   2. The material the doctor actually assigned to this patient.
 *
 * (2) matters more than it looks. Without it a patient who just watched a
 * section and asks a question about it gets escalated, which is the one case
 * where the bot obviously should have answered.
 */

import { and, asc, eq, isNull, or } from 'drizzle-orm';

import { db } from './db';
import { assignments, content, contentVersions, documents } from './schema';

/** A document Claude can cite. `file` is a PDF in the Files API; `text` is ours. */
export type Source =
  | { kind: 'file'; title: string; fileId: string }
  | { kind: 'text'; title: string; text: string };

/** The one visibility rule, identical to content's. */
export const visibleDocs = (doctorId: string) =>
  or(isNull(documents.ownerDoctorId), eq(documents.ownerDoctorId, doctorId))!;

export async function libraryFor(doctorId: string) {
  return db.select().from(documents)
    .where(and(visibleDocs(doctorId), eq(documents.published, true)))
    .orderBy(asc(documents.createdAt));
}

/**
 * The corpus for one patient's question.
 *
 * Scoped by the patient's own doctor — a patient can never be answered from a
 * different clinic's material, whatever they ask.
 *
 * Two sources, and the distinction matters. What a patient is asked to WATCH is
 * their assignments. What the assistant may CITE is everything their doctor has
 * approved — every written piece in the library, whether or not it was pushed
 * to this particular patient.
 *
 * They were one thing until the feed became videos only. Removing the written
 * pieces from patients' lists also removed them from the corpus, and the bot
 * started passing every clinical question to the doctor for want of anything to
 * quote — including questions answered word for word by a page sitting unread
 * in the library. Someone asking about potassium gets the potassium page
 * whether or not it was sent to them.
 */
export async function corpusFor(
  patient: { id: string; doctorId: string; language: string },
): Promise<Source[]> {
  const sources: Source[] = [];

  for (const d of await libraryFor(patient.doctorId)) {
    if (d.status !== 'ready' || !d.fileId) continue;   // still uploading, or failed
    sources.push({ kind: 'file', title: d.title, fileId: d.fileId });
  }

  const assigned = await db
    .select({
      kind: content.kind,
      title: contentVersions.title,
      summary: contentVersions.summary,
      bodyMd: contentVersions.bodyMd,
      caption: contentVersions.caption,
    })
    .from(assignments)
    .innerJoin(content, eq(content.id, assignments.contentId))
    .innerJoin(contentVersions, and(
      eq(contentVersions.contentId, content.id),
      eq(contentVersions.language, patient.language),
    ))
    .where(eq(assignments.patientId, patient.id))
    .orderBy(asc(assignments.createdAt));

  const seen = new Set<string>();
  for (const a of assigned) {
    const body = [a.summary, a.bodyMd ?? a.caption].filter(Boolean).join('\n\n').trim();
    if (body) {
      sources.push({ kind: 'text', title: a.title, text: body });
      seen.add(a.title);
    }
  }

  // Retired pieces are included on purpose: unpublished means "no longer
  // offered to send", not "no longer true". scripts/retire-text.ts took them
  // off the shelf for exactly that reason.
  const written = await db
    .select({ title: contentVersions.title, summary: contentVersions.summary, bodyMd: contentVersions.bodyMd })
    .from(content)
    .innerJoin(contentVersions, and(
      eq(contentVersions.contentId, content.id),
      eq(contentVersions.language, patient.language),
    ))
    .where(and(
      eq(content.kind, 'text'),
      or(isNull(content.ownerDoctorId), eq(content.ownerDoctorId, patient.doctorId)),
    ))
    .orderBy(asc(content.sortOrder));

  for (const w of written) {
    if (seen.has(w.title)) continue;
    const body = [w.summary, w.bodyMd].filter(Boolean).join('\n\n').trim();
    if (body) {
      sources.push({ kind: 'text', title: w.title, text: body });
      seen.add(w.title);
    }
  }

  return sources;
}

/* ------------------------------------------------------------- ingestion */

/** What Claude can read and cite. Anything else is refused at upload. */
export const ACCEPTED = ['application/pdf', 'text/plain', 'text/markdown'];
export const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Take a file into the library.
 *
 * The document is uploaded to the Files API once and referred to by id from
 * then on, so a 40-page PDF is not re-sent with every patient question. Our own
 * copy in blob storage is for the doctor to open again; when storage is not
 * configured the document still answers questions, because the copy that
 * matters lives with the model.
 */
export async function ingest(opts: {
  ownerDoctorId: string | null;
  title: string;
  filename: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ id?: string; error?: string }> {
  if (!ACCEPTED.includes(opts.mime)) return { error: 'Only PDF, text and markdown files.' };
  if (opts.bytes.byteLength > MAX_BYTES) return { error: 'That file is larger than 10 MB.' };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'The assistant is not configured.' };

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let fileId: string;
  try {
    const uploaded = await client.beta.files.upload({
      file: new File([new Uint8Array(opts.bytes)], opts.filename, { type: opts.mime }),
      betas: ['files-api-2025-04-14'],
    });
    fileId = uploaded.id;
  } catch (err) {
    console.error('files api upload failed', err);
    return { error: 'The file could not be prepared for the assistant.' };
  }

  let blobUrl: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const stored = await put(`documents/${opts.filename}`, opts.bytes, {
        access: 'public',
        addRandomSuffix: true,
        contentType: opts.mime,
      });
      blobUrl = stored.url;
    } catch (err) {
      // Not fatal: the document is already usable. The doctor just cannot
      // re-open the original from here.
      console.error('blob store failed', err);
    }
  }

  const [row] = await db.insert(documents).values({
    ownerDoctorId: opts.ownerDoctorId,
    title: opts.title.trim() || opts.filename,
    blobUrl,
    mime: opts.mime,
    sizeBytes: opts.bytes.byteLength,
    fileId,
    status: 'ready',
  }).returning({ id: documents.id });

  return { id: row.id };
}

/** Only your own. Saviora's documents are not yours to remove. */
export async function removeDocument(doctorId: string, id: string) {
  await db.delete(documents)
    .where(and(eq(documents.id, id), eq(documents.ownerDoctorId, doctorId)));
}
