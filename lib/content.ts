/**
 * Content: what a doctor can see, assign, and how far a patient got.
 *
 * One visibility rule governs everything here and in the document library:
 * content with no owner is Saviora's and every doctor sees it; content with an
 * owner belongs to that doctor alone. Nothing else decides who sees what, so
 * there is exactly one place to get it wrong — and one place to test.
 */

import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { db } from './db';
import { assignments, content, contentVersions, progressEvents } from './schema';

export type ContentKind = 'video' | 'text';

/** Saviora's, plus this doctor's own. Never another doctor's. */
export const visibleTo = (doctorId: string) =>
  or(isNull(content.ownerDoctorId), eq(content.ownerDoctorId, doctorId))!;

export type LibraryItem = {
  id: string;
  slug: string;
  kind: ContentKind;
  topic: string | null;
  estMinutes: number;
  /** The real length of this language's cut, when we know it. */
  durationSeconds: number | null;
  published: boolean;
  /** True when Saviora wrote it, which also means this doctor cannot edit it. */
  fromSaviora: boolean;
  title: string;
  summary: string | null;
  languages: string[];
};

/**
 * The library as the doctor sees it, in one query per concern rather than one
 * per row. `language` picks which version's title to show, falling back to
 * English rather than showing an untitled row.
 */
export async function library(doctorId: string, language = 'en'): Promise<LibraryItem[]> {
  const rows = await db.select().from(content)
    .where(and(visibleTo(doctorId), eq(content.published, true)))
    .orderBy(asc(content.sortOrder), asc(content.slug));
  if (rows.length === 0) return [];

  const versions = await db.select().from(contentVersions)
    .where(inArray(contentVersions.contentId, rows.map((r) => r.id)));

  return rows.map((row) => {
    const mine = versions.filter((v) => v.contentId === row.id);
    const chosen = mine.find((v) => v.language === language)
      ?? mine.find((v) => v.language === 'en')
      ?? mine[0];
    return {
      id: row.id,
      slug: row.slug,
      kind: row.kind as ContentKind,
      topic: row.topic,
      estMinutes: row.estMinutes,
      durationSeconds: chosen?.durationSeconds ?? null,
      published: row.published,
      fromSaviora: row.ownerDoctorId === null,
      title: chosen?.title ?? row.slug,
      summary: chosen?.summary ?? null,
      languages: mine.map((v) => v.language).sort(),
    };
  });
}

/** One piece with the version to show, or null if this doctor cannot see it. */
export async function contentFor(doctorId: string, contentId: string, language = 'en') {
  const [row] = await db.select().from(content)
    .where(and(eq(content.id, contentId), visibleTo(doctorId))).limit(1);
  if (!row) return null;

  const versions = await db.select().from(contentVersions)
    .where(eq(contentVersions.contentId, row.id));
  const version = versions.find((v) => v.language === language)
    ?? versions.find((v) => v.language === 'en') ?? versions[0];
  return { content: row, version, versions };
}

/**
 * Assign, skipping anything already assigned or not visible to this doctor.
 * Returns what was actually added, so the caller can say so honestly.
 */
export async function assign(
  doctorId: string, patientId: string, contentIds: string[], language: string,
): Promise<string[]> {
  if (contentIds.length === 0) return [];

  const allowed = await db.select({ id: content.id }).from(content)
    .where(and(inArray(content.id, contentIds), visibleTo(doctorId)));
  const existing = await db.select({ contentId: assignments.contentId }).from(assignments)
    .where(eq(assignments.patientId, patientId));
  const already = new Set(existing.map((e) => e.contentId));

  const toAdd = allowed.map((a) => a.id).filter((id) => !already.has(id));
  if (toAdd.length === 0) return [];

  await db.insert(assignments).values(
    toAdd.map((contentId) => ({ doctorId, patientId, contentId, language })),
  );
  return toAdd;
}

export type AssignedItem = {
  assignmentId: string;
  contentId: string;
  kind: ContentKind;
  title: string;
  summary: string | null;
  language: string;
  estMinutes: number;
  durationSeconds: number | null;
  videoId: string | null;
  /** Set instead of videoId when the doctor uploaded the file himself. */
  videoUrl: string | null;
  /** Furthest point reached, as a percentage. Derived, never stored. */
  percent: number;
  status: 'not_opened' | 'started' | 'completed';
  lastActivity: Date | null;
};

/**
 * What a patient was given, and how far they got.
 *
 * Percentage comes from the furthest `progress` event, so re-watching cannot
 * make it go backwards and a stored counter can never drift from the log.
 */
export async function assignedTo(patientId: string, language?: string): Promise<AssignedItem[]> {
  const rows = await db.select({ assignment: assignments, content })
    .from(assignments)
    .innerJoin(content, eq(assignments.contentId, content.id))
    .where(eq(assignments.patientId, patientId))
    .orderBy(asc(content.sortOrder), asc(assignments.createdAt));

  if (rows.length === 0) return [];

  // Versions are picked here rather than in the join. A coalesce inside a join
  // condition reads clever and is the sort of thing that quietly returns the
  // wrong language when one of the two is missing.
  const versions = await db.select().from(contentVersions)
    .where(inArray(contentVersions.contentId, rows.map((r) => r.content.id)));

  const pick = (contentId: string, want: string) => {
    const mine = versions.filter((v) => v.contentId === contentId);
    return mine.find((v) => v.language === want)
      ?? mine.find((v) => v.language === 'en')
      ?? mine[0];
  };

  const events = await db.select().from(progressEvents)
    .where(inArray(progressEvents.assignmentId, rows.map((r) => r.assignment.id)))
    .orderBy(desc(progressEvents.at));

  return rows.map(({ assignment, content: c }) => {
    const version = pick(c.id, language ?? assignment.language);
    const mine = events.filter((e) => e.assignmentId === assignment.id);
    const completed = mine.some((e) => e.type === 'completed');
    const furthest = mine.reduce((max, e) => Math.max(max, e.percent ?? 0), 0);
    const percent = completed ? 100 : furthest;
    return {
      assignmentId: assignment.id,
      contentId: c.id,
      kind: c.kind as ContentKind,
      title: version?.title ?? c.slug,
      summary: version?.summary ?? null,
      language: version?.language ?? assignment.language,
      estMinutes: c.estMinutes,
      durationSeconds: version?.durationSeconds ?? null,
      videoId: version?.videoId ?? null,
      videoUrl: version?.videoUrl ?? null,
      percent,
      status: completed ? 'completed' : mine.length > 0 ? 'started' : 'not_opened',
      lastActivity: mine[0]?.at ?? null,
    };
  });
}
