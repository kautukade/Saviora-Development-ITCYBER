/**
 * A patient with a history, so the product can be walked through.
 *
 *   npx tsx scripts/demo.ts ["Patient Name"]
 *
 * scripts/verify.ts proves the code is correct and deletes everything it made.
 * This does the opposite: it leaves behind a patient who has watched some of
 * what they were sent, asked real questions, had one answered and one passed to
 * the doctor, and sent in a lab report — so the doctor's screens have something
 * on them and the whole journey can be seen at once.
 *
 * Safe to re-run; it clears its own patient first. It refuses a non-local
 * database unless ALLOW_REMOTE_DEMO=yes, for the same reason verify.ts does.
 */

import './env';
import { readFileSync } from 'node:fs';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { handleInbound } from '../lib/bot';
import { assign } from '../lib/content';
import { db } from '../lib/db';
import { ingest, libraryFor } from '../lib/documents';
import { issueLink, patientUrl } from '../lib/links';
import {
  assignments, content, contentVersions, conversations, doctors, escalations,
  messages, patientLinks, patients, progressEvents, resultValues, testOrders, testResults,
} from '../lib/schema';

const NAME = process.argv[2] || 'Demo Patient';
// Derived from the name so two demo patients never collide on a number, which
// the bot refuses to disambiguate — deliberately, see lib/patients.ts.
const ADDRESS = '9198200' + String(
  [...NAME].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100000, 7),
).padStart(5, '0');
const REPORT = '.fixtures/report-kft.jpg';
const HANDOUT = '.fixtures/clinic-handout.pdf';

function refuseRemote() {
  const url = process.env.DATABASE_URL ?? '';
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || process.env.ALLOW_REMOTE_DEMO === 'yes') return;
  console.error(`\nscripts/demo.ts writes a patient into ${url.match(/@([^/?]+)/)?.[1] ?? 'that database'},\n` +
    `which is not local. Set ALLOW_REMOTE_DEMO=yes if that is really what you want.\n`);
  process.exit(2);
}

async function purge(name: string) {
  for (const p of await db.select().from(patients).where(eq(patients.name, name))) {
    for (const c of await db.select().from(conversations).where(eq(conversations.patientId, p.id))) {
      await db.delete(messages).where(eq(messages.conversationId, c.id));
    }
    await db.delete(conversations).where(eq(conversations.patientId, p.id));
    for (const a of await db.select().from(assignments).where(eq(assignments.patientId, p.id))) {
      await db.delete(progressEvents).where(eq(progressEvents.assignmentId, a.id));
    }
    await db.delete(assignments).where(eq(assignments.patientId, p.id));
    await db.delete(patientLinks).where(eq(patientLinks.patientId, p.id));
    await db.delete(resultValues).where(eq(resultValues.patientId, p.id));
    await db.delete(testResults).where(eq(testResults.patientId, p.id));
    await db.delete(testOrders).where(eq(testOrders.patientId, p.id));
    await db.delete(escalations).where(eq(escalations.patientId, p.id));
    await db.delete(patients).where(eq(patients.id, p.id));
  }
}

const days = (n: number) => new Date(Date.now() - n * 86400_000);

async function main() {
  refuseRemote();
  const [doctor] = await db.select().from(doctors)
    .where(eq(doctors.isActive, true)).orderBy(asc(doctors.createdAt)).limit(1);
  if (!doctor) { console.error('No doctor yet — run scripts/create-doctor.ts first.'); process.exit(1); }

  await purge(NAME);
  await db.delete(conversations).where(eq(conversations.address, ADDRESS));

  const [patient] = await db.insert(patients).values({
    doctorId: doctor.id, name: NAME, phone: ADDRESS, language: 'en', mrn: 'SN-0231',
    notes: 'CKD stage 3b. Started on an ACE inhibitor last visit.',
  }).returning();

  // Something for the assistant to answer from.
  if (!(await libraryFor(doctor.id)).some((d) => d.title === 'Clinic information')) {
    await ingest({
      ownerDoctorId: doctor.id, title: 'Clinic information',
      filename: 'clinic-handout.pdf', mime: 'application/pdf', bytes: readFileSync(HANDOUT),
    });
  }

  // Five sections of the course: one finished, one abandoned partway, three
  // never opened — which is what the doctor's screen is for.
  const slugs = [
    'ckd-course-intro', 'ckd-course-01', 'ckd-course-02', 'ckd-course-03', 'ckd-course-04',
  ];
  const rows = await db.select().from(content).where(inArray(content.slug, slugs));
  await assign(doctor.id, patient.id, rows.map((r) => r.id), patient.language);

  const given = await db.select({ id: assignments.id, slug: content.slug })
    .from(assignments).innerJoin(content, eq(content.id, assignments.contentId))
    .where(eq(assignments.patientId, patient.id));

  const progress = (slug: string, events: [string, number, number][]) => {
    const a = given.find((g) => g.slug === slug);
    return a ? events.map(([type, percent, ago]) => ({
      assignmentId: a.id, type, percent, positionSeconds: Math.round(percent * 2.4),
      at: days(ago), createdAt: days(ago),
    })) : [];
  };
  const events = [
    ...progress('ckd-course-intro', [['opened', 0, 6], ['progress', 55, 6], ['completed', 100, 6]]),
    ...progress('ckd-course-01', [['opened', 0, 3], ['progress', 40, 3]]),
  ];
  if (events.length) await db.insert(progressEvents).values(events);

  // A real conversation: one answerable, one not, one confirmed report.
  await db.insert(conversations).values({
    channel: 'console', address: ADDRESS, patientId: patient.id, optInState: 'opted_in',
  });
  const say = (text: string, extra = {}) =>
    handleInbound({ channel: 'console', address: ADDRESS, text, ...extra });

  console.log('\nbuilding the conversation…');
  for (const q of [
    'what time is the clinic open on saturday?',
    'my neighbour says I should try a herbal medicine for kidneys, is that ok?',
  ]) {
    const r = await say(q);
    console.log(`  [${r.outcome}] ${q}`);
  }

  const read = await say('', { kind: 'image', media: { bytes: readFileSync(REPORT), mime: 'image/jpeg' } });
  console.log(`  [${read.outcome}] (photographed a lab report)`);
  const confirmed = await say('yes that is right');
  console.log(`  [${confirmed.outcome}] confirmed the values`);

  const link = await issueLink(patient.id);

  console.log(`\n  Doctor   ${doctor.email}`);
  console.log(`  Patient  ${patient.name} — open the doctor's view at /patients`);
  console.log(`  Their link\n  ${patientUrl(link.token)}\n`);
  process.exit(0);
}
main();
