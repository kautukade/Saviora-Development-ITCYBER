/**
 * The patient's private link.
 *
 * The token is 256 bits of randomness and only its SHA-256 hash reaches the
 * database, so a dump of `patient_links` opens nothing. It is shown to the
 * doctor exactly once, at issue — there is no way to read it back, which is the
 * point rather than an oversight.
 *
 * Every failure — revoked, expired, never existed — returns the same nothing, so
 * a caller cannot learn whether a given patient exists.
 */

import { createHash, randomBytes } from 'node:crypto';

import { t } from './copy';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from './db';
import { patientLinks, patients } from './schema';

const EXPIRY_DAYS = 90;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Where a patient link points.
 *
 * The fallback matters more than the value. PUBLIC_BASE_URL was once set to the
 * apex domain, which serves the marketing site — so every link a doctor sent
 * would have opened a waitlist page instead of their patient's material, with
 * nothing in the app to show for it. Falling back to the deployment's own URL
 * means a missing or forgotten variable degrades to "this app", never to
 * whatever else happens to live on that domain.
 */
export function baseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`)
    || 'http://localhost:3000';
  return configured.replace(/\/$/, '');
}

export const patientUrl = (token: string) => `${baseUrl()}/p/${token}`;

/** Issues a fresh link. The raw token is returned here and nowhere else, ever. */
export async function issueLink(patientId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db.insert(patientLinks).values({
    patientId,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 6),
    expiresAt,
  }).returning();

  return { id: row.id, token, url: patientUrl(token), expiresAt };
}

export async function revokeLink(linkId: string) {
  await db.update(patientLinks).set({ revokedAt: new Date() })
    .where(eq(patientLinks.id, linkId));
}

export async function activeLinks(patientId: string) {
  return db.select().from(patientLinks)
    .where(and(eq(patientLinks.patientId, patientId), isNull(patientLinks.revokedAt)))
    .orderBy(desc(patientLinks.createdAt));
}

/** Resolves a token to a patient, or null. Never says why it failed. */
export async function patientForToken(token: string) {
  const [row] = await db.select({ link: patientLinks, patient: patients })
    .from(patientLinks)
    .innerJoin(patients, eq(patientLinks.patientId, patients.id))
    .where(eq(patientLinks.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return null;
  if (row.link.revokedAt) return null;
  if (row.link.expiresAt.getTime() < Date.now()) return null;

  await db.update(patientLinks).set({ lastUsedAt: new Date() })
    .where(eq(patientLinks.id, row.link.id));

  return { patient: row.patient, link: row.link };
}

/**
 * Opens WhatsApp with the message ready. The doctor presses send.
 *
 * This is a handoff, not the WhatsApp Business API — nothing is sent
 * automatically, and it should be described that way rather than implied to be
 * messaging automation.
 */
/**
 * What the patient reads when their link arrives.
 *
 * In their language, naming the doctor and naming what was sent. "Dr Naik has
 * sent you Sick-day rules" is a reason to tap; "some information has been
 * shared with you" is a reason to assume it is spam.
 */
export function linkMessage(opts: {
  doctorName: string;
  patientName?: string | null;
  language?: string;
  titles?: string[];
  url: string;
}): string {
  const lang = opts.language ?? 'en';
  const bare = opts.doctorName.replace(/^dr\.?\s+/i, '');
  const doctor = `${t('drPrefix', lang)} ${bare}`;
  const first = opts.patientName?.trim().split(/\s+/)[0] ?? '';
  const titles = opts.titles?.filter(Boolean) ?? [];

  const fill = (s: string, vals: Record<string, string>) =>
    s.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');

  const what =
    titles.length === 0 ? fill(t('sentSomething', lang), { doctor })
    : titles.length === 1 ? fill(t('sentOne', lang), { doctor, title: titles[0] })
    : fill(t('sentMany', lang), { doctor, count: String(titles.length), title: titles[0] });

  return [
    first ? fill(t('greetingLine', lang), { name: first }) : '',
    what,
    `${t('openHere', lang)} ${opts.url}`,
  ].filter(Boolean).join(' ');
}

/** The same message, as a wa.me handoff the doctor presses send on. */
export function whatsappHandoff(
  phone: string | null,
  doctorName: string,
  url: string,
  extra: { patientName?: string | null; language?: string; titles?: string[] } = {},
) {
  const digits = (phone ?? '').replace(/\D/g, '');
  const text = linkMessage({ doctorName, url, ...extra });
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Just open the chat — no prefilled text, because the doctor writes their own. */
export const whatsappChat = (phone: string | null) =>
  `https://wa.me/${(phone ?? '').replace(/\D/g, '')}`;
