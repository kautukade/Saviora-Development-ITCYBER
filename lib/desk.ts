/**
 * The assistant on the doctor's home screen.
 *
 * Different again from the other two. lib/claude.ts answers a patient from
 * approved material and refuses what it cannot cite. lib/record.ts answers a
 * doctor about one patient whose record it is handed. This one is asked
 * anything at all — "who is waiting", "open John Doe", "what did Meera's last
 * report show" — and has to work out which patient is meant before it can
 * answer, so it is given tools rather than a fixed context.
 *
 * It reads. It does not write. Anything that changes a patient's record or
 * sends them something is handed back as a place to go, with the choice still
 * in front of the doctor — an assistant that assigns material because it
 * thought that was the intent is a different and much worse product.
 */

import Anthropic from '@anthropic-ai/sdk';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';

import { db } from './db';
import { inboxFor } from './inbox';
import { recordFor } from './record';
import { assignments, escalations, patients, progressEvents } from './schema';

const MODEL = 'claude-sonnet-5';

const RULES = `You are the assistant on Dr {doctor}'s home screen in Saviora, a patient-education
platform. He opens this between patients, on a phone, with seconds to spare.

You can look things up with the tools you have. Use them rather than guessing — you do not know
anything about his patients until you have looked.

How to answer:
- Short. Two or three sentences unless he asked for a list. He is standing up.
- Plain prose, no markdown headings, no bullet points unless the answer genuinely is a list.
- Answer from what the tools return. If a tool returns nothing, say so — do not reason about
  what is likely.
- Give dates and numbers as they come back. Never re-unit or re-interpret a lab value.
- He is the clinician. No safety disclaimers, no "consult a doctor", no advice about what he
  should do clinically. Report what is there.

When he wants to be somewhere — "open John Doe", "show me Meera's reports" — call open_patient
and say one short line about what he will see. When he wants to send educational material to
someone, call start_sending. Do not describe the navigation; it happens.

If more than one patient matches a name, ask which, listing them. Never pick one.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_patients',
    description: 'Search this doctor\'s patients by name or hospital number. Use for any question that names a person, before anything else.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A name or part of one, or a hospital number' } },
      required: ['query'],
    },
  },
  {
    name: 'patient_record',
    description: 'Everything Saviora holds on one patient: what was assigned and how far they got, every question they asked and how it was handled, anything escalated, and every confirmed lab value. Use after find_patients.',
    input_schema: {
      type: 'object',
      properties: { patientId: { type: 'string' } },
      required: ['patientId'],
    },
  },
  {
    name: 'whats_waiting',
    description: 'Everything across all patients that is waiting on the doctor right now — questions the assistant passed to him, emergency wording, critical results.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'engagement',
    description: 'For every patient: how much of what was sent they have actually watched or read, and when they were last active. Use for questions about who is or is not engaging, who has not opened anything, and who is falling behind.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'open_patient',
    description: 'Take the doctor to a patient\'s page. Use when he asks to open, see or go to someone.',
    input_schema: {
      type: 'object',
      properties: { patientId: { type: 'string' } },
      required: ['patientId'],
    },
  },
  {
    name: 'start_sending',
    description: 'Open the flow for sending educational material, optionally to a named patient. Use when he wants to send, assign or share something.',
    input_schema: {
      type: 'object',
      properties: { patientId: { type: 'string', description: 'Optional — omit if he has not said who' } },
    },
  },
];

async function runTool(doctorId: string, name: string, input: Record<string, unknown>) {
  switch (name) {
    case 'find_patients': {
      const q = `%${String(input.query ?? '').trim()}%`;
      const rows = await db.select({
        id: patients.id, name: patients.name, mrn: patients.mrn,
        phone: patients.phone, language: patients.language, notes: patients.notes,
      }).from(patients)
        .where(and(eq(patients.doctorId, doctorId),
          or(ilike(patients.name, q), ilike(patients.mrn, q))))
        .limit(10);
      return rows.length ? rows : 'No patient of yours matches that.';
    }
    case 'patient_record': {
      const id = String(input.patientId ?? '');
      const [mine] = await db.select({ id: patients.id }).from(patients)
        .where(and(eq(patients.id, id), eq(patients.doctorId, doctorId))).limit(1);
      if (!mine) return 'Not one of your patients.';
      return (await recordFor(id)) ?? 'Nothing on file.';
    }
    case 'engagement': {
      const mine = await db.select({ id: patients.id, name: patients.name })
        .from(patients).where(eq(patients.doctorId, doctorId));
      if (!mine.length) return 'No patients yet.';

      const rows = await db.select({
        patientId: assignments.patientId,
        assignmentId: assignments.id,
      }).from(assignments)
        .where(inArray(assignments.patientId, mine.map((m) => m.id)));

      const finished = rows.length
        ? await db.select({ assignmentId: progressEvents.assignmentId })
            .from(progressEvents)
            .where(and(
              inArray(progressEvents.assignmentId, rows.map((r) => r.assignmentId)),
              eq(progressEvents.type, 'completed'),
            ))
        : [];
      const done = new Set(finished.map((f) => f.assignmentId));

      return mine.map((m) => {
        const theirs = rows.filter((r) => r.patientId === m.id);
        return {
          patient: m.name,
          sent: theirs.length,
          finished: theirs.filter((r) => done.has(r.assignmentId)).length,
        };
      });
    }
    case 'whats_waiting': {
      const items = await inboxFor(doctorId);
      const open = items.filter((i) => i.status !== 'answered');
      if (!open.length) return 'Nothing is waiting.';
      return open.map((i) => ({
        patient: i.patientName, kind: i.kind, redFlag: i.redFlag,
        text: i.text, at: i.at.toISOString().slice(0, 10),
      }));
    }
    default:
      return 'Unknown tool.';
  }
}

export type DeskTurn = { role: 'user' | 'assistant'; text: string };

/**
 * What to say while a tool runs.
 *
 * The assistant makes up to four model calls before it has an answer, so
 * without this the doctor watches nothing happen for several seconds and
 * assumes it is broken. Naming the step is not decoration: "reading the record"
 * and "checking what is waiting" tell him whether it understood the question,
 * early enough to stop and rephrase.
 */
const DOING: Record<string, string> = {
  find_patients:  'Looking through your patients',
  patient_record: 'Reading the record',
  whats_waiting:  'Checking what is waiting',
  engagement:     'Checking what they have watched',
  open_patient:   'Opening it',
  start_sending:  'Getting that ready',
};

export type DeskEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; navigate?: string }
  | { type: 'error'; text: string };

/**
 * The assistant, reporting as it works.
 *
 * Same loop as before — look things up, then answer — but yielding instead of
 * returning, so the first thing on screen arrives in well under a second and
 * the answer types itself out rather than landing whole.
 */
export async function* streamDesk(
  doctor: { id: string; name: string },
  question: string,
  history: DeskTurn[] = [],
): AsyncGenerator<DeskEvent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    yield { type: 'error', text: 'The assistant is not configured.' };
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user' as const, content: question },
  ];

  let navigate: string | undefined;

  try {
    yield { type: 'status', text: 'Thinking' };

    // Up to four passes: find the patient, read the record, answer. More than
    // that and it is looping rather than working.
    for (let pass = 0; pass < 4; pass++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 900,
        system: RULES.replace('{doctor}', doctor.name),
        tools: TOOLS,
        messages,
      });

      // Text is forwarded as it arrives. On a pass that turns out to be a tool
      // call there is usually none, so nothing is shown prematurely.
      let said = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          said += event.delta.text;
          yield { type: 'delta', text: event.delta.text };
        }
      }

      const res = await stream.finalMessage();
      const calls = res.content.filter((b) => b.type === 'tool_use');

      if (!calls.length) {
        yield { type: 'done', text: said.trim(), navigate };
        return;
      }

      for (const call of calls) {
        const doing = DOING[call.name];
        if (doing) yield { type: 'status', text: doing };
      }

      messages.push({ role: 'assistant', content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const call of calls) {
        const input = (call.input ?? {}) as Record<string, unknown>;

        if (call.name === 'open_patient' || call.name === 'start_sending') {
          const id = String(input.patientId ?? '');
          if (id) {
            const [mine] = await db.select({ id: patients.id }).from(patients)
              .where(and(eq(patients.id, id), eq(patients.doctorId, doctor.id))).limit(1);
            if (!mine) {
              results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Not one of your patients.' });
              continue;
            }
          }
          navigate = call.name === 'open_patient'
            ? `/patients/${id}`
            : id ? `/send?patient=${id}` : '/send';
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Opening it now.' });
          continue;
        }

        const out = await runTool(doctor.id, call.name, input);
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: typeof out === 'string' ? out : JSON.stringify(out),
        });
      }

      messages.push({ role: 'user', content: results });
      if (navigate) {
        // It knows where he wants to go; a paragraph about it is a delay.
        yield { type: 'done', text: said.trim() || 'Opening it.', navigate };
        return;
      }
    }
    yield { type: 'done', text: 'That took too many steps. Try asking it more directly.' };
  } catch (err) {
    console.error('desk assistant failed', err);
    yield { type: 'error', text: 'That did not go through. Try again.' };
  }
}

/** The three numbers the home screen shows as marks rather than lists. */
export async function deskCounts(doctorId: string) {
  const mine = await db.select({ id: patients.id }).from(patients)
    .where(eq(patients.doctorId, doctorId));
  const ids = mine.map((m) => m.id);

  if (!ids.length) return { waiting: 0, urgent: 0, patients: 0 };

  const open = await db.select({ kind: escalations.kind, status: escalations.status })
    .from(escalations)
    .where(and(inArray(escalations.patientId, ids), inArray(escalations.status, ['new', 'seen'])));

  return {
    waiting: open.length,
    urgent: open.filter((e) => e.kind === 'red_flag').length,
    patients: ids.length,
  };
}
