/**
 * What happens when a patient photographs a lab report.
 *
 * The flow is deliberately slow at one point: nothing is written to the record
 * until the patient has read the values back and agreed. A machine reading a
 * number off a photograph is a good guess, not a fact, and a wrong potassium
 * entering a chart is the worst thing this product could do.
 *
 * What the patient is told is equally deliberate. When a value is dangerous
 * they are told their doctor has been shown it — not what it means.
 * Interpreting a result is the doctor's job.
 */

import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { extractReport } from './claude';
import { t } from './copy';
import { db } from './db';
import { analytesFor, flagFor, normalise, type Analyte } from './panels';
import { escalations, patients, resultValues, testOrders, testResults } from './schema';

/** How long after a read-back a plain "yes" still confirms it. */
const CONFIRMATION_WINDOW_HOURS = 48;
const MAX_ATTEMPTS = 2;
const MAX_BYTES = 8 * 1024 * 1024;

type Patient = typeof patients.$inferSelect;
type Result = typeof testResults.$inferSelect;

/* ------------------------------------------------------------ yes and no */

// Matched on the first word rather than with a regex word boundary. `\b` is a
// transition between a word and a non-word character, and Devanagari combining
// marks (the ँ in "हाँ", the ीं in "नहीं") are not word characters — so a
// trailing `\b` never matched them and every Hindi patient confirming their
// results was silently ignored.
const SPLIT = /[\s,.!?।;:\-]+/;

const YES = new Set([
  'y', 'yes', 'yeah', 'yep', 'ok', 'okay', 'correct', 'right',
  'haan', 'han', 'ha', 'sahi', 'thik', 'theek', 'bilkul',
  'हाँ', 'हां', 'सही', 'ठीक', 'जी', 'बिलकुल', 'बिल्कुल',
]);
const NO = new Set([
  'n', 'no', 'nope', 'wrong', 'incorrect',
  'nahi', 'nahin', 'na', 'galat',
  'नहीं', 'नही', 'ना', 'गलत',
]);

const firstWord = (text: string) =>
  (text ?? '').trim().split(SPLIT).filter(Boolean)[0]?.toLowerCase() ?? '';

export const isYes = (text: string) => YES.has(firstWord(text));
export const isNo = (text: string) => NO.has(firstWord(text));

/* ---------------------------------------------------------------- orders */

export async function openOrder(patientId: string) {
  const [order] = await db.select().from(testOrders)
    .where(and(eq(testOrders.patientId, patientId), inArray(testOrders.status, ['ordered', 'reminded'])))
    .orderBy(desc(testOrders.createdAt)).limit(1);
  return order ?? null;
}

/**
 * What to look for. Without an order we still accept the report and look for
 * the common panels, rather than refusing a patient who is being helpful.
 */
const expectedAnalytes = (order: { panelKeys: string[] } | null) =>
  analytesFor(order?.panelKeys?.length ? order.panelKeys : ['kft', 'cbc']);

/* ---------------------------------------------------------------- intake */

async function store(bytes: Buffer, mime: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { put } = await import('@vercel/blob');
    const stored = await put(`reports/report.${mime.split('/')[1] ?? 'bin'}`, bytes, {
      access: 'public', addRandomSuffix: true, contentType: mime,
    });
    return stored.url;
  } catch (err) {
    console.error('report store failed', err);
    return null;
  }
}

/** Store and read a report. Returns the row and the message for the patient. */
export async function intake(
  patient: Patient,
  bytes: Buffer,
  mime: string,
): Promise<{ result: Result | null; reply: string; outcome: string }> {
  const lang = patient.language;
  if (bytes.byteLength > MAX_BYTES) {
    return { result: null, reply: t('tooBig', lang), outcome: 'report_too_big' };
  }

  const order = await openOrder(patient.id);

  // A second unreadable photo of the same report is the last one we ask for.
  const [previous] = await db.select().from(testResults)
    .where(and(eq(testResults.patientId, patient.id), eq(testResults.status, 'unreadable')))
    .orderBy(desc(testResults.createdAt)).limit(1);
  const attempt = previous ? previous.attempt + 1 : 1;

  const [result] = await db.insert(testResults).values({
    orderId: order?.id ?? null,
    patientId: patient.id,
    blobUrl: await store(bytes, mime),
    mime,
    attempt,
    createdAt: new Date(),
  }).returning();

  const read = await extractReport(bytes, mime, expectedAnalytes(order));
  const found = read.readings.filter((r) => r.found && r.value !== null);

  const patch = { extraction: read as unknown as Record<string, unknown>, labName: read.lab_name };

  if (!read.legible) {
    await db.update(testResults).set({ ...patch, status: 'unreadable' })
      .where(eq(testResults.id, result.id));
    if (attempt >= MAX_ATTEMPTS) {
      await file(patient.id, 'unreadable', 'Could not read the report photo after two attempts.');
      return { result, reply: t('gaveUp', lang), outcome: 'report_unreadable' };
    }
    return { result, reply: t('retake', lang), outcome: 'report_retake' };
  }

  if (found.length === 0) {
    await db.update(testResults).set({ ...patch, status: 'unreadable' })
      .where(eq(testResults.id, result.id));
    await file(patient.id, 'unreadable', 'Report was readable but contained none of the ordered tests.');
    return { result, reply: t('nothingFound', lang), outcome: 'report_nothing_found' };
  }

  const [updated] = await db.update(testResults).set({ ...patch, status: 'extracted' })
    .where(eq(testResults.id, result.id)).returning();
  return { result: updated, reply: readback(updated, lang), outcome: 'report_read' };
}

/* -------------------------------------------------------------- readback */

const HINDI_LABELS: Record<string, string> = {
  creatinine: 'क्रिएटिनिन', urea: 'यूरिया', sodium: 'सोडियम', potassium: 'पोटैशियम',
  calcium: 'कैल्शियम', phosphorus: 'फ़ॉस्फ़ोरस', albumin: 'एल्ब्यूमिन',
  bicarbonate: 'बाइकार्बोनेट', egfr: 'eGFR', haemoglobin: 'हीमोग्लोबिन',
  platelets: 'प्लेटलेट्स', hba1c: 'HbA1c', tlc: 'श्वेत रक्त कोशिकाएँ',
  uacr: 'यूरिन ACR', ipth: 'PTH',
};

const label = (analyte: Analyte, language: string) =>
  language === 'hi' ? HINDI_LABELS[analyte.key] ?? analyte.name : analyte.name;

export type NormalisedReading = {
  analyte: Analyte; value: number; unit: string; rawText: string | null;
};

/** Readings that survived unit normalisation, in the report's own order. */
export function normalisedReadings(result: Result): NormalisedReading[] {
  const byKey = Object.fromEntries(
    analytesFor(['kft', 'cbc', 'bone', 'hba1c']).map((a) => [a.key, a]),
  );
  const rows = (result.extraction as { readings?: {
    analyte?: string; found?: boolean; value?: number | null; unit?: string | null; raw_text?: string | null;
  }[] })?.readings ?? [];

  const out: NormalisedReading[] = [];
  for (const row of rows) {
    const analyte = byKey[row.analyte ?? ''];
    if (!analyte || !row.found || row.value == null) continue;
    const converted = normalise(analyte, Number(row.value), row.unit);
    // An unrecognised unit is dropped rather than guessed at — that assumption
    // is how a µmol/L creatinine becomes a catastrophic mg/dL reading. The
    // doctor still sees it in the stored extraction.
    if (!converted) continue;
    out.push({ analyte, value: converted.value, unit: converted.unit, rawText: row.raw_text ?? null });
  }
  return out;
}

/** The values, in the patient's language, before anything is saved. */
export function readback(result: Result, language: string): string {
  const lines = [t('readbackIntro', language), ''];
  for (const r of normalisedReadings(result)) {
    lines.push(`• ${label(r.analyte, language)}: ${r.value} ${r.unit}`);
  }
  lines.push('', t('readbackAsk', language));
  return lines.join('\n');
}

/* ---------------------------------------------------------- confirmation */

export async function awaitingConfirmation(patientId: string): Promise<Result | null> {
  const [result] = await db.select().from(testResults)
    .where(and(eq(testResults.patientId, patientId), eq(testResults.status, 'extracted')))
    .orderBy(desc(testResults.createdAt)).limit(1);
  if (!result) return null;
  const age = Date.now() - result.createdAt.getTime();
  return age <= CONFIRMATION_WINDOW_HOURS * 3600_000 ? result : null;
}

async function previousValue(patientId: string, analyteKey: string, notResultId: string) {
  const [row] = await db.select({ value: resultValues.value }).from(resultValues)
    .where(and(
      eq(resultValues.patientId, patientId),
      eq(resultValues.analyte, analyteKey),
      ne(resultValues.resultId, notResultId),
    ))
    .orderBy(desc(resultValues.createdAt)).limit(1);
  return row?.value ?? null;
}

/** The patient agreed. Only now does anything reach the record. */
export async function confirm(result: Result, patient: Patient) {
  const written: {
    analyte: string; name: string; value: number; unit: string;
    flag: string | null; escalated: boolean;
  }[] = [];

  for (const r of normalisedReadings(result)) {
    const flag = flagFor(r.analyte, r.value, await previousValue(patient.id, r.analyte.key, result.id));
    const escalated = flag === 'critical' || flag === 'delta';
    await db.insert(resultValues).values({
      resultId: result.id, patientId: patient.id, analyte: r.analyte.key,
      value: r.value, unit: r.unit, rawText: r.rawText, flag, escalated,
      createdAt: new Date(),
    });
    written.push({
      analyte: r.analyte.key, name: r.analyte.name,
      value: r.value, unit: r.unit, flag, escalated,
    });
  }

  await db.update(testResults)
    .set({ status: 'confirmed', confirmedAt: new Date() })
    .where(eq(testResults.id, result.id));

  const urgent = written.filter((w) => w.escalated);
  if (urgent.length) {
    // The doctor's name for the test, and the words the results table already
    // uses — not the column key and the raw enum.
    const summary = urgent
      .map((w) => `${w.name} ${w.value} ${w.unit} (${w.flag === 'critical' ? 'critical' : 'changed'})`)
      .join(', ');
    await file(patient.id, 'result', `Result needs attention: ${summary}`, true);
  }

  return {
    reply: t(urgent.length ? 'savedFlagged' : 'saved', patient.language),
    written,
    escalated: urgent.length > 0,
  };
}

/** The patient says we read it wrong. A human looks at the report. */
export async function reject(result: Result, patient: Patient) {
  await db.update(testResults).set({ status: 'rejected' }).where(eq(testResults.id, result.id));
  await file(patient.id, 'result', 'Patient says the values read from their report are wrong.');
  return t('resultRejected', patient.language);
}

async function file(patientId: string, kind: string, text: string, redFlag = false) {
  await db.insert(escalations).values({ patientId, kind, text, redFlag, createdAt: new Date() });
}

/* --------------------------------------------------------- the doctor's view */

export type ResultView = {
  id: string;
  status: string;
  labName: string | null;
  blobUrl: string | null;
  at: Date;
  confirmedAt: Date | null;
  values: {
    analyte: string; name: string; value: number; unit: string;
    flag: string | null; rawText: string | null;
  }[];
  /** Read but not yet agreed by the patient — nothing here is in the record. */
  pending: boolean;
};

export async function resultsFor(patientId: string, limit = 5): Promise<ResultView[]> {
  const rows = await db.select().from(testResults)
    .where(eq(testResults.patientId, patientId))
    .orderBy(desc(testResults.createdAt)).limit(limit);

  const byKey = Object.fromEntries(
    analytesFor(['kft', 'cbc', 'bone', 'hba1c']).map((a) => [a.key, a]),
  );

  return Promise.all(rows.map(async (r) => {
    const saved = await db.select().from(resultValues)
      .where(eq(resultValues.resultId, r.id)).orderBy(resultValues.createdAt);

    // Before confirmation there is nothing in the record, so the doctor sees
    // what was read — labelled as not yet agreed, never mixed in with it.
    //
    // Those unconfirmed readings are still flagged on screen. Writing an
    // unconfirmed number to the record would be wrong; showing a doctor a
    // potassium of 5.8 as an ordinary black number, on a report the patient
    // has disputed or not yet answered, would be worse. The flag is a display
    // property here, and the banner above it says nothing has been recorded.
    const values = saved.length
      ? saved.map((v) => ({
          analyte: v.analyte, name: byKey[v.analyte]?.name ?? v.analyte,
          value: v.value, unit: v.unit, flag: v.flag, rawText: v.rawText,
        }))
      : await Promise.all(normalisedReadings(r).map(async (n) => ({
          analyte: n.analyte.key, name: n.analyte.name,
          value: n.value, unit: n.unit, rawText: n.rawText,
          flag: flagFor(n.analyte, n.value, await previousValue(patientId, n.analyte.key, r.id)),
        })));

    return {
      id: r.id, status: r.status, labName: r.labName, blobUrl: r.blobUrl,
      at: r.createdAt, confirmedAt: r.confirmedAt,
      values, pending: r.status === 'extracted',
    };
  }));
}

/* ----------------------------------------------------------------- trends */

export type SeriesPoint = {
  value: number; at: Date; flag: string | null; rawText: string | null;
};

export type Series = {
  analyte: string; name: string; unit: string;
  normalLow?: number; normalHigh?: number;
  criticalLow?: number; criticalHigh?: number;
  /** Oldest first, so a chart can be drawn straight from it. */
  points: SeriesPoint[];
};

/**
 * Every confirmed value for this patient, grouped by test.
 *
 * One series per test and never a shared axis: creatinine in mg/dL and eGFR in
 * mL/min/1.73m² on one pair of axes would be a chart that looks like a
 * comparison and is not one. They are drawn as small multiples instead.
 */
export async function seriesFor(patientId: string): Promise<Series[]> {
  const rows = await db.select().from(resultValues)
    .where(eq(resultValues.patientId, patientId))
    .orderBy(resultValues.createdAt);

  const byKey = Object.fromEntries(
    analytesFor(['kft', 'cbc', 'bone', 'hba1c']).map((a) => [a.key, a]),
  );
  const order = Object.keys(byKey);

  const out = new Map<string, Series>();
  for (const v of rows) {
    const a = byKey[v.analyte];
    if (!a) continue;
    if (!out.has(v.analyte)) {
      out.set(v.analyte, {
        analyte: a.key, name: a.name, unit: a.unit,
        normalLow: a.normalLow, normalHigh: a.normalHigh,
        criticalLow: a.criticalLow, criticalHigh: a.criticalHigh,
        points: [],
      });
    }
    out.get(v.analyte)!.points.push({
      value: v.value, at: v.createdAt, flag: v.flag, rawText: v.rawText,
    });
  }

  return [...out.values()].sort(
    (x, y) => order.indexOf(x.analyte) - order.indexOf(y.analyte));
}
