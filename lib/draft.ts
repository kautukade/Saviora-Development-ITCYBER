/**
 * A reply for the doctor to approve, edit or throw away.
 *
 * Never sent on its own. The patient assistant already refused this question —
 * that is why it is in front of a doctor at all — so the draft exists to save
 * him typing, not to decide anything. It is written in his voice because it
 * goes out under his name, and it says plainly when it does not know.
 *
 * It reads the same two things a good reply would: what this patient's own
 * record says, and what the doctor has approved as material.
 */

import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';

import { db } from './db';
import { corpusFor } from './documents';
import { recordFor } from './record';
import { doctors, patients } from './schema';

const MODEL = 'claude-sonnet-5';

const RULES = `You draft a reply for a doctor to send to his own patient on WhatsApp. He will read it,
change what he wants, and press send. You are saving him typing, not deciding anything.

Write as the doctor, to the patient, in their language.

- Two to four sentences. This is WhatsApp, and it is read on a phone.
- Plain words. No medical jargon unless the material uses it and explains it.
- Answer the question that was asked, from the approved material and the patient's own record
  below. Both are given to you.
- Where the answer depends on something you have not been told — a value not in the record, a
  decision only he can make — say so in the draft in one short clause, so he can fill it in.
  Do not invent it and do not leave a blank.
- Never give or change a dose. Never tell them to start or stop a medicine. Those are his words
  to write, not yours; if the question is about one, draft a reply that says he will go through
  it with them and leaves the decision to him.
- No greeting or sign-off. He is continuing a conversation, not writing a letter.
- Plain sentences only. No markdown, no bullets, no headings.

If the material and the record do not contain what is needed, draft one honest sentence saying
he will look into it and come back to them, rather than a confident answer.`;

export async function draftReply(
  patientId: string, question: string,
): Promise<{ text: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { text: '', error: 'The assistant is not configured.' };

  const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!patient) return { text: '', error: 'Patient not found.' };
  const [doctor] = await db.select().from(doctors).where(eq(doctors.id, patient.doctorId)).limit(1);

  const [record, sources] = await Promise.all([recordFor(patientId), corpusFor(patient)]);

  const material = sources.map((s) =>
    s.kind === 'text' ? `### ${s.title}\n${s.text}` : `### ${s.title} (document)`,
  ).join('\n\n');

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 600,
      betas: ['files-api-2025-04-14'],
      system: [
        { type: 'text', text: RULES },
        {
          type: 'text',
          text: `The doctor is ${doctor?.name ?? 'their doctor'}. The patient is ${patient.name}, `
            + `who reads ${patient.language === 'hi' ? 'Hindi' : 'English'} — write the draft in that language.`
            + `\n\nTHEIR RECORD\n\n${record ?? '(nothing on file)'}`
            + `\n\nAPPROVED MATERIAL\n\n${material || '(none)'}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: `The patient asked: "${question}"\n\nDraft his reply.` }],
    });

    const block = res.content.find((b) => b.type === 'text');
    return { text: block && 'text' in block ? block.text.trim() : '' };
  } catch (err) {
    console.error('draft failed', err);
    return { text: '', error: 'Could not draft that. Write it yourself, or try again.' };
  }
}
