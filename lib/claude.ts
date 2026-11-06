/**
 * The assistant. Server-side only — the API key never reaches a browser.
 *
 * The patient-facing assistant is not open-ended. Its entire world is the
 * material in lib/documents.ts, handed over as citable document blocks, and it
 * is told to escalate rather than improvise.
 *
 * Two independent rails, because one that depends on the model behaving is not
 * a rail:
 *
 *   - the sentinel: a fixed string the model emits when the answer is not in
 *     the material. Detecting a constant is deterministic; parsing prose for
 *     "I'm not sure" is not.
 *   - the citation gate: citations are enabled, so a grounded answer comes back
 *     with the sentences it drew from. An answer citing nothing was written from
 *     the model's own knowledge, and goes to the doctor instead of the patient —
 *     whether or not it looks right.
 *
 * The emergency screen in lib/redflags.ts runs before this module is reached.
 */

import Anthropic from '@anthropic-ai/sdk';

import type { Source } from './documents';

export const ESCALATE = '[[ESCALATE]]';

const ANSWER_MODEL = 'claude-sonnet-5';

export const assistantEnabled = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', hi: 'Hindi (हिंदी)' };

const RULES = (doctor: string, patient: string, language: string) =>
`You are a patient-education assistant working for ${doctor}.

You are speaking to ${patient}, their patient. Your ONLY job is to explain, in
simpler words, the material ${doctor} has approved, which is attached to this
conversation as documents. That material is the complete extent of what you know.

Absolute rules:
- Answer ONLY from the attached documents. Do not add facts from anywhere else,
  however confident you are and however basic the question seems.
- If the answer is not in the documents, do not attempt it. Reply with ${ESCALATE}
  on the first line, then one short sentence in ${LANGUAGE_NAMES[language] ?? 'English'}
  saying you do not have that in their material and their doctor will be asked.
- Never give, suggest or change a dose, a quantity, or a frequency of any medicine.
- Never name a medicine that does not appear in the documents.
- Never diagnose, never interpret a symptom, never interpret a lab result or a
  number the patient gives you.
- Never tell the patient to start, stop, reduce or delay any treatment. If they
  ask whether to stop something, escalate — that decision belongs to their doctor.
- Never contradict the documents, even if the patient insists.
- If the patient describes something urgent or worsening, escalate.
- Every sentence you write must be supported by the attached documents. The
  system records which parts of them you drew on, and an answer that draws on
  none of them is not delivered to the patient at all — it goes to the doctor
  instead. So answer from the documents, and add nothing they do not say.

How to write:
- Reply in ${LANGUAGE_NAMES[language] ?? 'English'}.
- Short plain sentences. No medical jargon unless the documents use it and explain it.
- Two to four sentences is usually right. Six is the maximum, even when the
  material has more to say.
- Write prose for one person, in your own plain words. Never paste a list out of
  the material: if it lists ten things, name the two or three that answer this
  question and say the rest is in what their doctor sent.
- Say each thing once. Do not restate a sentence you have already written.
- No opening compliment. Never begin with "Great question" or similar — answer.
- Plain sentences only. This is WhatsApp: no bullet points, no numbering, no
  markdown, no headings. If you need to list things, name them inside a sentence.
- Warm and matter of fact. Do not be alarming, and do not be falsely reassuring.
- When the answer touches anything clinical, end by pointing them back to ${doctor}.`;

export type Turn = { role: 'user' | 'assistant'; text: string };

export type Answer = {
  text: string;
  escalate: boolean;
  /** answered | sentinel | uncited | refusal | no_corpus | disabled | error */
  reason: string;
  citations: { title: string; quote: string }[];
  usage: Record<string, number>;
  model?: string;
};

function documentBlocks(sources: Source[]) {
  const blocks = sources.map((s) => ({
    type: 'document' as const,
    title: s.title,
    citations: { enabled: true },
    source: s.kind === 'file'
      ? { type: 'file' as const, file_id: s.fileId }
      : { type: 'text' as const, media_type: 'text/plain' as const, data: s.text },
  }));
  // The corpus is identical on every turn of every conversation for this
  // doctor, so it should be read from cache rather than re-billed in full.
  if (blocks.length) {
    (blocks[blocks.length - 1] as Record<string, unknown>).cache_control = { type: 'ephemeral' };
  }
  return blocks;
}

export async function answerFromCorpus(opts: {
  doctorName: string;
  patientName: string;
  language: string;
  sources: Source[];
  history: Turn[];
  question: string;
}): Promise<Answer> {
  const empty = { citations: [], usage: {} };

  if (!assistantEnabled()) {
    return { text: '', escalate: true, reason: 'disabled', ...empty };
  }
  // Nothing approved to answer from is not a reason to answer from memory.
  if (opts.sources.length === 0) {
    return { text: '', escalate: true, reason: 'no_corpus', ...empty };
  }

  const turns: Turn[] = [...opts.history, { role: 'user', text: opts.question }];
  const messages = turns.map((t, i) => ({
    role: t.role,
    content: i === 0
      ? [...documentBlocks(opts.sources), { type: 'text' as const, text: t.text }]
      : t.text,
  }));

  try {
    // The beta endpoint, because a document block that refers to an uploaded
    // file by id needs the Files API beta. One code path for both source kinds.
    const res = await anthropic().beta.messages.create({
      model: ANSWER_MODEL,
      max_tokens: 1000,
      betas: ['files-api-2025-04-14'],
      system: RULES(opts.doctorName, opts.patientName, opts.language),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
    });

    let text = '';
    const citations: { title: string; quote: string }[] = [];
    for (const block of res.content) {
      if (block.type !== 'text') continue;
      text += block.text;
      for (const c of block.citations ?? []) {
        // Web-search citations share the union but can never occur here — the
        // assistant has no tools, only documents.
        if (!('document_title' in c)) continue;
        citations.push({
          title: c.document_title ?? 'Document',
          quote: 'cited_text' in c ? c.cited_text : '',
        });
      }
    }

    let escalate = false;
    let reason = 'answered';
    const trimmed = text.trim();
    if (trimmed.startsWith(ESCALATE)) {
      escalate = true;
      reason = 'sentinel';
    } else if (res.stop_reason === 'refusal') {
      // The model declining is itself a reason to involve the doctor.
      escalate = true;
      reason = 'refusal';
    } else if (citations.length === 0) {
      // The gate. Fluent, plausible, and drawn from nowhere the doctor approved.
      escalate = true;
      reason = 'uncited';
    }

    return {
      text: trimmed.replace(ESCALATE, '').trim(),
      escalate,
      reason,
      citations,
      model: ANSWER_MODEL,
      usage: {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (err) {
    console.error('assistant call failed', err);
    return { text: '', escalate: true, reason: 'error', ...empty };
  }
}

/* --------------------------------------------------------------- reports */

/**
 * Reading a lab report out of a photograph.
 *
 * Accuracy here comes mostly from knowing what to look for: extraction runs
 * against the analytes the doctor actually ordered, with the aliases Indian
 * labs print and the units a value can arrive in. An open-ended "read this
 * report" is a harder problem and a worse one.
 *
 * Three rules the rest of the system depends on:
 *
 *   - Never guess. A value that is blurred, cropped or ambiguous is reported as
 *     not found. A missing value costs a re-photograph; a wrong one enters a
 *     medical record.
 *   - Never convert silently. The cell as printed is kept beside the normalised
 *     value, so a disputed number traces back to what was on the page.
 *   - Nothing is saved here. This reads; the patient confirms; only then does
 *     anything reach the record.
 */

const EXTRACTION_MODEL = 'claude-opus-5';

const EXTRACTION_RULES = `You read laboratory reports and return only what is printed on them.

You are given a photograph or PDF of a report and a list of analytes to look for.
For each one, report the value exactly as printed, with its unit exactly as printed.

Rules:
- Report only what you can actually read. If a value is blurred, cut off, covered,
  or you are not certain which analyte a number belongs to, mark it not found. A
  missing value costs the patient another photograph. A wrong value goes into
  their medical record.
- Do not convert units. Do not calculate a value that is not printed, including
  eGFR — if the report does not print it, it was not found.
- Do not infer a value from a reference range or a neighbouring row.
- An analyte may be printed under a different name than the one given. Match on
  meaning, not on the exact string.
- If the whole report is unreadable, set legible to false and say briefly what is
  wrong with the image, in a way that tells someone how to retake it.

Fields:
- value: the number alone, as a number.
- unit: the unit alone, exactly as printed on the report.
- raw_text: the result cell exactly as printed and nothing else — the number with
  any high/low marker beside it, such as "5.8 H". Not the test name, not the unit,
  not the reference range.`;

export type Reading = {
  analyte: string;
  found: boolean;
  value: number | null;
  unit: string | null;
  raw_text: string | null;
};

export type Extraction = {
  legible: boolean;
  problem: string | null;
  lab_name: string | null;
  reported_on: string | null;
  readings: Reading[];
};

const extractionSchema = (keys: string[]) => ({
  type: 'object',
  properties: {
    legible: { type: 'boolean' },
    problem: { type: ['string', 'null'] },
    lab_name: { type: ['string', 'null'] },
    reported_on: { type: ['string', 'null'] },
    readings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          analyte: { type: 'string', enum: keys },
          found: { type: 'boolean' },
          value: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          raw_text: { type: ['string', 'null'] },
        },
        required: ['analyte', 'found', 'value', 'unit', 'raw_text'],
        additionalProperties: false,
      },
    },
  },
  required: ['legible', 'problem', 'lab_name', 'reported_on', 'readings'],
  additionalProperties: false,
});

type LookingFor = {
  key: string; name: string; unit: string;
  aliases: string[]; altUnits?: Record<string, number>;
};

export async function extractReport(
  bytes: Buffer,
  mime: string,
  analytes: LookingFor[],
): Promise<Extraction> {
  if (!assistantEnabled()) {
    return { legible: false, problem: 'extraction_unavailable', lab_name: null, reported_on: null, readings: [] };
  }

  const looking = analytes.map((a) => {
    const units = [a.unit, ...Object.keys(a.altUnits ?? {})].join('/');
    const aliases = a.aliases.length ? ` — also printed as: ${a.aliases.join(', ')}` : '';
    return `- ${a.key}: ${a.name}, usually in ${units}${aliases}`;
  }).join('\n');

  const media = mime === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: bytes.toString('base64') } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mime as 'image/jpeg', data: bytes.toString('base64') } };

  try {
    const res = await anthropic().messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      // A number read off a photograph and written to a medical record is worth
      // the extra thinking.
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: extractionSchema(analytes.map((a) => a.key)) },
      },
      system: EXTRACTION_RULES,
      messages: [{ role: 'user', content: [media, { type: 'text', text: `Look for these analytes:\n\n${looking}` }] }],
    });

    if (res.stop_reason === 'refusal') {
      return { legible: false, problem: 'refused', lab_name: null, reported_on: null, readings: [] };
    }
    const text = res.content.find((b) => b.type === 'text');
    const data = JSON.parse(text && 'text' in text ? text.text : '{}') as Extraction;
    return {
      legible: !!data.legible,
      problem: data.problem ?? null,
      lab_name: data.lab_name ?? null,
      reported_on: data.reported_on ?? null,
      readings: Array.isArray(data.readings) ? data.readings : [],
    };
  } catch (err) {
    console.error('extraction failed', err);
    return { legible: false, problem: 'error', lab_name: null, reported_on: null, readings: [] };
  }
}
