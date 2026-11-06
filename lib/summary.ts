/**
 * What the doctor reads in the thirty seconds before the patient walks in.
 *
 * Every line here is derived from what actually happened — watched, asked,
 * escalated, measured — not written by a model. A summary of a patient's own
 * record is exactly the place where a fluent paraphrase is most dangerous and
 * least necessary: the facts are few, structured, and already in the database.
 */

import { and, desc, eq, gte } from 'drizzle-orm';

import { assignedTo, type AssignedItem } from './content';
import { db } from './db';
import { resultsFor, type ResultView } from './labs';
import { ALL_ANALYTES, analytesFor } from './panels';
import { conversations, escalations, messages, resultValues } from './schema';

export type AskedQuestion = {
  text: string; at: Date;
  /** answered from the doctor's material · passed to the doctor · emergency */
  outcome: 'answered' | 'passed' | 'emergency';
  /** Set when the doctor has since dealt with it, and what they said. */
  handled?: boolean;
  reply?: string | null;
};

export type Trend = {
  analyte: string; name: string; unit: string;
  value: number; flag: string | null;
  /** When THIS value was confirmed — the number he prescribes against. */
  at: Date;
  previous: number | null; previousAt: Date | null;
};

export type Summary = {
  assigned: AssignedItem[];
  watched: number;
  untouched: AssignedItem[];
  asked: AskedQuestion[];
  openEscalations: (typeof escalations.$inferSelect)[];
  /** The patient used emergency wording. Not the same thing as a bad number. */
  redFlags: (typeof escalations.$inferSelect)[];
  /** A confirmed value past a critical threshold, or moving fast. */
  criticalResults: (typeof escalations.$inferSelect)[];
  results: ResultView[];
  trends: Trend[];
  lastSeen: Date | null;
};

/** Housekeeping, not questions: opt-outs and read-back confirmations. */
const NOT_A_QUESTION = /^(stop|start|unsubscribe|band|y|yes|no|n|ok|okay|haan|han|nahi|nahin|बंद|शुरू|हाँ|हां|नहीं|नही|ठीक|सही)\b/i;

export async function summaryFor(patientId: string, days = 90): Promise<Summary> {
  const since = new Date(Date.now() - days * 86400_000);

  const [assigned, results, open] = await Promise.all([
    assignedTo(patientId),
    resultsFor(patientId, 3),
    db.select().from(escalations)
      .where(and(eq(escalations.patientId, patientId), gte(escalations.createdAt, since)))
      .orderBy(desc(escalations.createdAt)),
  ]);

  const [conv] = await db.select().from(conversations)
    .where(eq(conversations.patientId, patientId)).limit(1);

  let asked: AskedQuestion[] = [];
  if (conv) {
    const rows = await db.select().from(messages)
      .where(and(eq(messages.conversationId, conv.id), gte(messages.createdAt, since)))
      .orderBy(desc(messages.createdAt)).limit(60);
    rows.reverse();

    asked = rows
      .map((m, i) => ({ m, next: rows[i + 1] }))
      .filter(({ m }) => m.direction === 'in' && m.text && !NOT_A_QUESTION.test(m.text.trim()))
      .map(({ m, next }) => {
        const meta = (next?.meta ?? {}) as {
          escalated?: boolean; redFlags?: unknown; escalationId?: string | null;
        };
        // Three different things, and calling them all "answered" is how a
        // doctor comes to believe a chest-pain message was handled by the
        // assistant reading their handout.
        // Anything that reached the doctor's inbox was passed to them, whatever
        // else the assistant also said. A question about stopping a medicine is
        // answered from the material AND filed — and calling that "answered"
        // told the doctor his handout had dealt with it.
        const outcome: AskedQuestion['outcome'] =
          meta.redFlags ? 'emergency'
          : next?.direction === 'out' && !meta.escalated && !meta.escalationId ? 'answered'
          : 'passed';
        return { text: m.text!, at: m.createdAt, outcome };
      })
      .reverse();
  }

  // A question passed to the doctor and since dealt with should not still read
  // as waiting. Matched on the patient's own words, which is what the
  // escalation stored.
  const settled = new Map<string, { reply: string | null }>();
  for (const e of open) {
    if (e.status === 'answered') settled.set(e.text.trim(), { reply: e.reply });
  }
  for (const q of asked) {
    const hit = settled.get(q.text.trim());
    if (hit && q.outcome !== 'answered') {
      q.handled = true;
      q.reply = hit.reply;
    }
  }

  // The newest confirmed value per analyte, and the one before it.
  // Deliberately NOT bounded to `since`, unlike the messages and escalations
  // above. Kidney bloods are often three- or six-monthly, and a doctor opening
  // this before a visit needs the last value there was — not a blank table
  // because it predates an arbitrary window. What made it misleading was the
  // missing date, and every row now carries its own.
  const values = await db.select().from(resultValues)
    .where(eq(resultValues.patientId, patientId))
    .orderBy(desc(resultValues.createdAt));

  // Panel order, not the order they happened to be written. A doctor reads
  // creatinine and eGFR first; sorting by insertion time put bicarbonate at the
  // top and creatinine at the bottom.
  const panelOrder = analytesFor(['kft', 'cbc', 'bone', 'hba1c']).map((a) => a.key);

  const trends: Trend[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v.analyte)) continue;
    seen.add(v.analyte);
    const older = values.find((o) => o.analyte === v.analyte && o.createdAt < v.createdAt);
    trends.push({
      analyte: v.analyte,
      name: ALL_ANALYTES[v.analyte]?.name ?? v.analyte,
      unit: v.unit, value: v.value, flag: v.flag, at: v.createdAt,
      previous: older?.value ?? null, previousAt: older?.createdAt ?? null,
    });
  }

  trends.sort((a, b) => {
    const ia = panelOrder.indexOf(a.analyte), ib = panelOrder.indexOf(b.analyte);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const lastActivity = assigned
    .map((a) => a.lastActivity).filter(Boolean) as Date[];
  const lastMessage = conv?.lastInboundAt ?? null;
  const dates = [...lastActivity, ...(lastMessage ? [lastMessage] : [])];

  return {
    assigned,
    watched: assigned.filter((a) => a.status === 'completed').length,
    untouched: assigned.filter((a) => a.status === 'not_opened'),
    asked,
    openEscalations: open.filter((e) => e.status !== 'answered'),
    redFlags: open.filter((e) => e.kind === 'red_flag'),
    criticalResults: open.filter((e) => e.kind === 'result' && e.redFlag),
    results,
    trends,
    lastSeen: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
  };
}
