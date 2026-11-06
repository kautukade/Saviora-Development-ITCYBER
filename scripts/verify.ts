/**
 * One pass over the whole journey, against the real database and the real
 * model. Run it after any change to the bot, the rails or the record.
 *
 *   npx tsx scripts/verify.ts
 *
 * Sample reports live in .fixtures/, which is not part of the product and is
 * not committed.
 */

import './env';
import { readFileSync } from 'node:fs';
import { asc, eq } from 'drizzle-orm';

import { handleInbound, replyStatus, sendFromDoctor } from '../lib/bot';
import { classify } from '../lib/intent';
import { db } from '../lib/db';
import { ingest, libraryFor } from '../lib/documents';
import { issueLink, patientForToken } from '../lib/links';
import { phoneClash } from '../lib/patients';
import { summaryFor } from '../lib/summary';
import {
  assignments, conversations, doctors, escalations, messages, patientLinks,
  patients, progressEvents, resultValues, testOrders, testResults,
} from '../lib/schema';

const REPORT = '.fixtures/report-kft.jpg';
const HANDOUT = '.fixtures/clinic-handout.pdf';
const HANDOUT_TITLE = 'Verification clinic handout';
const ADDRESS = '919820099999';

let failures = 0;
const ok = (label: string, pass: boolean) => {
  if (!pass) failures++;
  console.log(`  ${pass ? '✓' : '✗'} ${label}`);
};

/** Leave nothing behind, so the run is repeatable and the pilot data stays clean. */
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

/**
 * This script writes: it creates a patient, speaks as them, files results, then
 * deletes it all. Fine against a scratch database, unacceptable against the one
 * the pilot runs on — and the Neon integration points development and
 * production at the same branch, so the default target IS production.
 */
function refuseRemote() {
  const url = process.env.DATABASE_URL ?? '';
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (local || process.env.ALLOW_REMOTE_VERIFY === 'yes') return;
  const host = url.match(/@([^/?]+)/)?.[1] ?? 'that database';
  console.error(
    `\nverify.ts writes to whatever DATABASE_URL points at, and this one is not local:\n` +
    `  ${host}\n\n` +
    `Point it at a scratch database, or set ALLOW_REMOTE_VERIFY=yes if you really do\n` +
    `mean to create and delete rows there.\n`);
  process.exit(2);
}

async function main() {
  refuseRemote();
  // The first doctor created — the pilot. `where(isActive)` with no ordering
  // picked whichever row came back first, which was sometimes the second
  // doctor from the ownership fixture, whose library is empty: every grounded
  // answer then escalated for want of a corpus and the run failed at random.
  const [doctor] = await db.select().from(doctors)
    .where(eq(doctors.isActive, true)).orderBy(asc(doctors.createdAt)).limit(1);
  console.log(`\nverifying as Dr ${doctor.name}`);

  await purge('Verification Patient');
  await purge('Verification Twin');
  await db.delete(conversations).where(eq(conversations.address, ADDRESS));
  const [p] = await db.insert(patients).values({
    doctorId: doctor.id, name: 'Verification Patient', phone: ADDRESS, language: 'en',
  }).returning();
  const say = (text: string, extra = {}) =>
    handleInbound({ channel: 'console', address: ADDRESS, text, ...extra });

  console.log('\nthe link');
  const link = await issueLink(p.id);
  ok('a fresh token resolves to this patient', (await patientForToken(link.token))?.patient.id === p.id);
  ok('an invented token resolves to nobody', (await patientForToken('not-a-real-token')) === null);

  // The grounded-answer checks need something to ground in. Without this the
  // run depends on a database somebody prepared by hand, and three checks fail
  // for want of a corpus rather than for want of correct behaviour.
  const library = await libraryFor(doctor.id);
  if (!library.some((d) => d.title === HANDOUT_TITLE)) {
    const added = await ingest({
      ownerDoctorId: doctor.id,
      title: HANDOUT_TITLE,
      filename: 'clinic-handout.pdf',
      mime: 'application/pdf',
      bytes: readFileSync(HANDOUT),
    });
    ok('the clinic handout is in the library to answer from', !added.error);
  }

  console.log('\nthe bot');
  ok('emergency wording answers without the model',
    (await say('I have chest pain since morning')).outcome === 'emergency');
  const q = await say('what time is the clinic open on saturday?');
  ok('a question the material covers is answered', q.outcome === 'answered');
  ok('the answer quotes the material', (q.citations?.length ?? 0) > 0);
  ok('the emergency did not colour the later answer',
    !/emergency|ambulance|casualty/i.test(q.reply ?? ''));
  ok('a question nothing covers is passed to the doctor',
    (await say('how much does dialysis cost in Pune?')).outcome === 'escalated');

  console.log('\nthe report');
  const read = await say('', { kind: 'image', media: { bytes: readFileSync(REPORT), mime: 'image/jpeg' } });
  ok('the values are read back before anything is saved', read.outcome === 'report_read');
  ok('nothing is in the record yet',
    (await db.select().from(resultValues).where(eq(resultValues.patientId, p.id))).length === 0);
  ok('confirming writes them', (await say('yes')).outcome === 'result_confirmed');
  const values = await db.select().from(resultValues).where(eq(resultValues.patientId, p.id));
  ok('potassium 5.8 is critical and escalated',
    values.some((v) => v.analyte === 'potassium' && v.flag === 'critical' && v.escalated));
  ok('mEq/L was converted to mmol/L',
    values.find((v) => v.analyte === 'sodium')?.unit === 'mmol/L');

  console.log('\nbefore the visit');
  const s = await summaryFor(p.id);
  if (process.env.KEEP) {
    for (const a of s.asked) console.log(`    [${a.outcome}] ${a.text.slice(0, 46)}`);
    const [c] = await db.select().from(conversations).where(eq(conversations.patientId, p.id));
    for (const m of await db.select().from(messages)
        .where(eq(messages.conversationId, c.id)).orderBy(asc(messages.createdAt))) {
      const meta = m.meta as Record<string, unknown>;
      console.log(`    ${m.createdAt.toISOString()} ${m.direction} ` +
        `esc=${meta.escalated} red=${!!meta.redFlags} | ${(m.text || '(none)').slice(0, 34).replace(/\n/g, ' ')}`);
    }
  }
  ok('emergency wording is listed as emergency wording', s.redFlags.length === 1);
  ok('the critical value is listed separately', s.criticalResults.length === 1);
  ok('an answered question is not called an escalation',
    s.asked.some((a) => a.outcome === 'answered'));
  ok('the emergency turn is not called answered',
    s.asked.some((a) => a.outcome === 'emergency'));
  ok('creatinine leads the values', s.trends[0]?.analyte === 'creatinine');

  console.log('\nwhat the patient is doing');
  {
    const cases: [string, boolean, string][] = [
      // The case the old first-word yes/no match got wrong: a confirmation that
      // does not start with "yes" was answered as though it were a question.
      ['that is correct', true, 'confirm_result'],
      ['हाँ', true, 'confirm_result'],
      ['ok thanks doctor', false, 'smalltalk'],
      ['i want to speak to dr naik please', false, 'wants_doctor'],
      ['please stop sending me these messages', false, 'opt_out'],
      ['can I eat bananas with CKD?', false, 'question'],
    ];
    for (const [text, pending, want] of cases) {
      const got = await classify(text, { awaitingReadback: pending });
      ok(`"${text.slice(0, 34)}" → ${want}`, got.intent === want);
    }
    // A classifier outage must degrade the bot, not stop it.
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const blind = await classify('can I eat bananas?', {});
    const blindYes = await classify('haan', { awaitingReadback: true });
    if (key) process.env.ANTHROPIC_API_KEY = key;
    ok('with no classifier, an unclear message still reaches the assistant',
      blind.intent === 'question' && blind.by === 'heuristic');
    ok('and the word list still confirms a read-back', blindYes.intent === 'confirm_result');
  }

  console.log('\nthe doctor replies');
  {
    const [conv] = await db.select().from(conversations)
      .where(eq(conversations.patientId, p.id)).limit(1);

    const before = (await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))).length;
    const sent = await sendFromDoctor(p.id, 'I have seen your potassium. Come in tomorrow morning.');
    // Ordered explicitly. Without it Postgres may return the rows in any order
    // it likes and at(-1) is not reliably the message just sent — which made
    // this check pass or fail at random.
    const after = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    ok('a reply is delivered and recorded', sent.ok && after.length === before + 1);
    ok('it is marked as coming from the doctor',
      !!(after.at(-1)?.meta as { fromDoctor?: boolean })?.fromDoctor);

    // WhatsApp refuses free-form text more than 24 hours after the patient's
    // last message. The doctor has to be told that, not left to assume it sent.
    await db.update(conversations)
      .set({ channel: 'whatsapp', windowExpiresAt: new Date(Date.now() - 3600_000) })
      .where(eq(conversations.id, conv.id));
    const stale = await sendFromDoctor(p.id, 'anyone there?');
    ok('a closed 24-hour window refuses the reply', !stale.ok && stale.reason === 'window_closed');
    ok('and the inbox knows before the doctor types',
      !(await replyStatus(p.id)).canReply);

    await db.update(conversations)
      .set({ channel: 'console', windowExpiresAt: null, optInState: 'stopped' })
      .where(eq(conversations.id, conv.id));
    const stopped = await sendFromDoctor(p.id, 'are you there?');
    ok('an opted-out patient is not messaged, even by their doctor',
      !stopped.ok && stopped.reason === 'opted_out');

    await db.update(conversations).set({ optInState: 'opted_in' })
      .where(eq(conversations.id, conv.id));
  }

  // A second patient on the same number. The bot must stop rather than pick one:
  // answering from the wrong person's material, or filing their blood results to
  // the wrong record, is the worst thing this product could do quietly.
  console.log('\ntwo patients, one phone');
  await db.insert(patients).values({
    doctorId: doctor.id, name: 'Verification Twin', phone: ADDRESS, language: 'en',
  });
  await db.delete(conversations).where(eq(conversations.address, ADDRESS));
  const ambiguous = await say('can I eat bananas?');
  ok('a shared number is not answered', ambiguous.outcome === 'unlinked');
  ok('and is told why', /more than one person/i.test(ambiguous.reply ?? ''));

  ok('the form would refuse a third patient on that number',
    (await phoneClash(ADDRESS, doctor.id)) !== null);

  // KEEP=1 leaves the rows in place for inspection after a failure.
  if (!process.env.KEEP) {
    await purge('Verification Patient');
    await purge('Verification Twin');
    await db.delete(conversations).where(eq(conversations.address, ADDRESS));
  }
  console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
