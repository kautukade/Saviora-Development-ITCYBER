/**
 * The doctor asking about their own patient.
 *
 * Different from the patient assistant in lib/claude.ts, and deliberately so.
 * That one answers a patient from clinically approved material and refuses
 * anything it cannot cite. This one answers a clinician about their own
 * patient's record — they already have every right to see all of it, so the
 * job is retrieval and summary, not gatekeeping.
 *
 * What stays the same is grounding: it answers from the record it is given and
 * says when something is not in it. A summary of a patient that invents a
 * detail is worse than no summary.
 */

import Anthropic from '@anthropic-ai/sdk';

import { db } from './db';
import { summaryFor } from './summary';
import { patients } from './schema';
import { eq } from 'drizzle-orm';

const MODEL = 'claude-sonnet-5';

const RULES = `You answer a doctor's questions about one of their own patients, from that patient's
Saviora record, which is given below.

The record is everything Saviora holds: what the doctor assigned, how much of it the patient
actually watched or read, what they asked on WhatsApp and how it was answered, anything escalated
to the doctor, and lab values the patient photographed and confirmed.

How to answer:
- Answer from the record only. If it does not contain something, say so plainly — "there is
  nothing in the record about that" — rather than reasoning about what is likely.
- Be direct and short. This is read between patients, often in under a minute.
- Give dates and numbers as they appear. Do not round, re-unit or re-interpret a lab value.
- You are talking to the treating clinician, not the patient. No safety disclaimers, no
  suggesting they consult a doctor, no advice about what they should do clinically — they are
  the doctor. Report what happened.
- Where something did not happen, that is often the answer: content not opened, a question that
  went unanswered, a report never sent.
- Plain prose. Short paragraphs. A list only where the record is genuinely a list.`;

/** The record as text. Small enough to send whole; no retrieval needed. */
export async function recordFor(patientId: string): Promise<string | null> {
  const [patient] = await db.select().from(patients).where(eq(patients.id, patientId));
  if (!patient) return null;

  const s = await summaryFor(patientId, 3650);
  const date = (d: Date | null) =>
    d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const lines: string[] = [
    `PATIENT: ${patient.name}`,
    `Hospital number: ${patient.mrn ?? 'none'} · Reads: ${patient.language.toUpperCase()}` +
      ` · WhatsApp: ${patient.phone ?? 'no number on file'}`,
    patient.notes ? `Doctor's note: ${patient.notes}` : '',
    `Last active: ${date(s.lastSeen)}`,
    '',
    `ASSIGNED MATERIAL (${s.watched} of ${s.assigned.length} finished)`,
  ];

  for (const a of s.assigned) {
    lines.push(`- ${a.title} — ${
      a.status === 'completed' ? 'watched in full'
      : a.status === 'started' ? `stopped at ${a.percent}%`
      : 'never opened'}${a.lastActivity ? `, last ${date(a.lastActivity)}` : ''}`);
  }
  if (!s.assigned.length) lines.push('- nothing assigned yet');

  lines.push('', `QUESTIONS THEY ASKED (${s.asked.length})`);
  for (const q of s.asked) {
    lines.push(`- ${date(q.at)} "${q.text}" — ${
      q.outcome === 'answered' ? 'answered from the approved material'
      : q.outcome === 'emergency' ? 'EMERGENCY WORDING: told to seek care, doctor notified'
      : 'passed to the doctor'}`);
  }
  if (!s.asked.length) lines.push('- none');

  // The summary exposes the same escalation through more than one list — a
  // critical result is both a red flag and an open item — so they are merged by
  // id. Listed twice, the model dutifully reported it as having been raised
  // twice, which is a different and alarming clinical claim.
  const raised = new Map<string, (typeof s.openEscalations)[number]>();
  for (const e of [...s.redFlags, ...s.criticalResults, ...s.openEscalations]) raised.set(e.id, e);

  lines.push('', `RAISED WITH THE DOCTOR (${s.openEscalations.length} still open)`);
  for (const e of [...raised.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    lines.push(`- ${date(e.createdAt)} [${e.kind}${e.redFlag ? ', red flag' : ''}, ${e.status}] ${e.text}` +
      (e.reply ? ` — doctor replied: "${e.reply}"` : ''));
  }

  lines.push('', 'LAB RESULTS');
  for (const r of s.results) {
    lines.push(`- ${date(r.confirmedAt ?? r.at)} ${r.labName ?? 'report'} (${r.status})`);
    for (const v of r.values) {
      lines.push(`    ${v.name}: ${v.value} ${v.unit}${v.flag ? `  [${v.flag}]` : ''}` +
        (v.rawText ? `  (printed: ${v.rawText})` : ''));
    }
  }
  if (!s.results.length) lines.push('- no reports sent');

  if (s.trends.length) {
    lines.push('', 'MOST RECENT CONFIRMED VALUE PER TEST');
    for (const t of s.trends) {
      lines.push(`- ${t.name}: ${t.value} ${t.unit}${t.flag ? ` [${t.flag}]` : ''}` +
        (t.previous != null ? `, previously ${t.previous} on ${date(t.previousAt)}` : ''));
    }
  }

  return lines.filter((l) => l !== '').join('\n');
}

export type Turn = { role: 'user' | 'assistant'; text: string };

export async function askAboutPatient(
  patientId: string,
  question: string,
  history: Turn[] = [],
): Promise<{ text: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: '', error: 'The assistant is not configured.' };
  }
  const record = await recordFor(patientId);
  if (!record) return { text: '', error: 'Patient not found.' };

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: [
        // The record is the same on every turn of a conversation, so it should
        // be read from cache rather than re-billed in full.
        { type: 'text', text: RULES },
        { type: 'text', text: `THE RECORD\n\n${record}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [...history, { role: 'user' as const, text: question }]
        .map((t) => ({ role: t.role, content: t.text })),
    });
    const block = res.content.find((b) => b.type === 'text');
    return { text: block && 'text' in block ? block.text.trim() : '' };
  } catch (err) {
    console.error('record chat failed', err);
    return { text: '', error: 'That did not go through. Try again.' };
  }
}
