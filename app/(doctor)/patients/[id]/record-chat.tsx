'use client';

import { useActionState, useEffect, useRef } from 'react';
import { CornerDownLeft } from 'lucide-react';

import { askAction, type AskState } from '@/app/actions/record';
import { Markdown } from '@/components/Markdown';

/**
 * Ask about this patient.
 *
 * The openers are the questions a doctor actually has in the ten seconds before
 * someone walks in, and they double as documentation of what this can answer —
 * an empty box with a blinking cursor teaches nobody what to type.
 */
const OPENERS = [
  'Summarise this patient',
  'What have they actually watched?',
  'Anything I have not answered?',
  'What did their last report show?',
];

export function RecordChat({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [state, action, pending] = useActionState<AskState, FormData>(askAction, { turns: [] });
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  /**
   * The openers fill the field and submit it, rather than carrying their own
   * value. A submit button named `question` beside an input named `question`
   * sends both, and formData.get() returns the first — the empty input — so
   * every chip silently did nothing.
   */
  const ask = (question: string) => {
    if (!field.current || !form.current) return;
    field.current.value = question;
    form.current.requestSubmit();
  };

  useEffect(() => {
    // Scroll the question to the top, not the conversation to the bottom. A
    // chat window lands you on the newest line; a summary has to be read from
    // its first word, and bottom-scrolling put the doctor at the end of it.
    const asked = box.current?.querySelector<HTMLElement>('[data-turn="user"]:last-of-type');
    if (asked && box.current) {
      box.current.scrollTo({ top: asked.offsetTop - box.current.offsetTop, behavior: 'smooth' });
    }
    if (!pending) field.current?.focus();
  }, [state.turns.length, pending]);

  const first = state.turns.length === 0;

  return (
    <section className="sheet p-4">
      <h2 className="label mb-1">Ask about {patientName.split(' ')[0]}</h2>
      <p className="note mb-3">
        Answers from their record only — what you sent, what they watched, asked, and reported.
      </p>

      {!first && (
        <div ref={box} className="max-h-[340px] overflow-y-auto flex flex-col gap-3 mb-3 pr-1">
          {state.turns.map((t, i) => (
            t.role === 'user' ? (
              <p key={i} data-turn="user" className="text-[14px] font-medium">{t.text}</p>
            ) : (
              <div key={i} className="text-[14px] leading-relaxed text-ink-2 border-l-2 border-rule pl-3">
                <Markdown source={t.text} />
              </div>
            )
          ))}
          {pending && <p className="note text-ink-3">Reading the record…</p>}
        </div>
      )}

      <form ref={form} action={action}>
        <input type="hidden" name="patientId" value={patientId} />
        <div className="flex items-center gap-2">
          <input
            ref={field}
            name="question"
            placeholder={first ? 'Ask anything about this patient' : 'Ask something else'}
            autoComplete="off"
            className="flex-1 min-w-0 bg-surface border border-rule rounded-[3px] px-3 py-2 text-[16px] [@media(pointer:fine)]:text-[14px]"
          />
          <button className="btn px-3 py-2" disabled={pending} aria-label="Ask">
            <CornerDownLeft className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>

        {first && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {OPENERS.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} disabled={pending}
                      className="tap chip-note hover:border-brand hover:text-brand active:border-brand
                                 active:text-brand transition-colors">
                {q}
              </button>
            ))}
          </div>
        )}
        {state.error && <p className="note text-alarm mt-2">{state.error}</p>}
      </form>
    </section>
  );
}
