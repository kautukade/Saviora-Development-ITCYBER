/**
 * What the patient is actually doing with this message.
 *
 * The loop used to route on hand-written patterns: a word list for STOP, a
 * first-word match for yes/no, a regex for medicines. Those work for the
 * phrasings I thought of and fail on the rest — "that's correct" after a
 * read-back is not a first word yes, so a confirmation got answered as though
 * it were a question, and "ok thanks" cost a full grounded-answer call to
 * produce something nobody wanted.
 *
 * Two rules govern where this sits:
 *
 *   - It runs AFTER the emergency screen in lib/redflags.ts, never before. That
 *     screen is deterministic and must not come to depend on a model call
 *     succeeding. Chest pain is answered with no model in the loop at all.
 *   - It falls back to the old heuristics whenever the call fails, is refused,
 *     or returns something unexpected. A classifier outage should degrade the
 *     bot, not stop it.
 */

import Anthropic from '@anthropic-ai/sdk';

import { isNo, isYes } from './labs';
import { needsDoctor } from './redflags';

/** Cheap and fast: this is a routing decision, not a clinical one. */
const INTENT_MODEL = 'claude-haiku-4-5-20251001';

export const INTENTS = [
  'confirm_result',
  'reject_result',
  'question',
  'wants_doctor',
  'smalltalk',
  'opt_out',
  'other',
] as const;

export type Intent = (typeof INTENTS)[number];

export type Classification = {
  intent: Intent;
  /** 'model' when classified, 'heuristic' when we fell back. */
  by: 'model' | 'heuristic';
};

const STOP_WORDS = new Set(['stop', 'unsubscribe', 'band', 'बंद', 'रोको', 'रोकें']);

const firstWord = (text: string) =>
  text.trim().split(/[\s,.!?।;:\-]+/).filter(Boolean)[0]?.toLowerCase() ?? '';

/**
 * The rules the bot shipped with. Still the fallback, and still the answer for
 * anything unambiguous — no point paying for a model call to read "STOP".
 */
export function heuristicIntent(text: string, awaitingReadback: boolean): Intent | null {
  const word = firstWord(text);
  if (STOP_WORDS.has(text.trim().toLowerCase()) || STOP_WORDS.has(word)) return 'opt_out';
  if (awaitingReadback && isYes(text)) return 'confirm_result';
  if (awaitingReadback && isNo(text)) return 'reject_result';
  return null;
}

const RULES = `You label one WhatsApp message from a patient to their clinic. Reply with one label and nothing else.

confirm_result   The patient is agreeing that lab values read back to them are correct.
reject_result    The patient is saying those values are wrong, or disputing them.
question         They are asking something — about their condition, treatment, medicines,
                 diet, the clinic, or material their doctor sent. Most messages are this.
wants_doctor     They are asking to speak to, see, or be called by their doctor or the clinic
                 staff — rather than asking a question they want answered here.
smalltalk        Greeting, thanks, acknowledgement, or anything needing no answer. "ok",
                 "thank you doctor", "namaste".
opt_out          They want to stop receiving messages.
other            None of the above, or too unclear to tell.

The patient may write in English, Hindi, romanised Hindi, or a mixture.

confirm_result and reject_result apply ONLY when told that a read-back is pending. When it is
not, agreement or disagreement about something else is question or smalltalk.

A message that both acknowledges and asks is a question — the question is the part that needs
answering.`;

export async function classify(
  text: string,
  { awaitingReadback = false }: { awaitingReadback?: boolean } = {},
): Promise<Classification> {
  const quick = heuristicIntent(text, awaitingReadback);
  if (quick) return { intent: quick, by: 'heuristic' };

  const fallback = (): Classification => ({
    // Treating an unclassifiable message as a question is the safe default: it
    // goes through the grounded assistant, which answers only from approved
    // material and hands anything else to the doctor.
    intent: 'question',
    by: 'heuristic',
  });

  if (!process.env.ANTHROPIC_API_KEY || !text.trim()) return fallback();

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: INTENT_MODEL,
      max_tokens: 16,
      system: RULES,
      messages: [{
        role: 'user',
        content: `${awaitingReadback
          ? 'A read-back of lab values is pending; the patient may be confirming it.'
          : 'No read-back is pending.'}\n\nMessage: ${text}`,
      }],
    });

    const block = res.content.find((b) => b.type === 'text');
    const label = (block && 'text' in block ? block.text : '').trim().toLowerCase();
    const hit = INTENTS.find((i) => label.startsWith(i));
    return hit ? { intent: hit, by: 'model' } : fallback();
  } catch (err) {
    console.error('intent classification failed', err);
    return fallback();
  }
}
