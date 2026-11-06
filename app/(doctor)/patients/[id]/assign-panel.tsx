'use client';

import { useActionState } from 'react';
import { BookOpen, Play } from 'lucide-react';

import { assignAction, type AssignState } from '@/app/actions/patients';
import { howLong } from '@/lib/copy';

type Choice = {
  id: string; title: string; kind: 'video' | 'text';
  estMinutes: number; durationSeconds: number | null; fromSaviora: boolean;
};

export function AssignPanel({ patientId, language, choices }: {
  patientId: string; language: string; choices: Choice[];
}) {
  const [state, action, pending] = useActionState<AssignState, FormData>(assignAction, {});

  return (
    <div className="sheet p-4">
      <h3 className="label mb-1">Send something</h3>
      <p className="note mb-3">
        They&rsquo;ll get it in {language === 'hi' ? 'Hindi' : 'English'} where there is a
        version, and English where there isn&rsquo;t.
      </p>

      {choices.length === 0 ? (
        <p className="note">They already have everything in your library.</p>
      ) : (
        <form action={action}>
          <input type="hidden" name="patientId" value={patientId} />
          <div className="max-h-[320px] overflow-y-auto border border-rule rounded-[3px] divide-y divide-rule-soft">
            {choices.map((choice) => (
              <label key={choice.id}
                     className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-brand-wash/40">
                <input type="checkbox" name="contentId" value={choice.id}
                       className="mt-1 accent-[var(--color-brand)]" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] leading-snug">
                    {choice.kind === 'video'
                      ? <Play className="w-3 h-3 text-brand shrink-0" strokeWidth={2} />
                      : <BookOpen className="w-3 h-3 text-brand shrink-0" strokeWidth={2} />}
                    {choice.title}
                  </span>
                  <span className="label block mt-0.5">
                    {howLong(choice.durationSeconds, choice.estMinutes)} · {choice.fromSaviora ? 'Saviora' : 'yours'}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <button className="btn btn-primary mt-3" disabled={pending}>
            {pending ? 'Adding…' : 'Add to their list'}
          </button>
        </form>
      )}

      {state.added !== undefined && state.added > 0 && (
        <p className="note text-brand mt-2">
          Added {state.added}. Now create their link above and send it.
        </p>
      )}
      {state.error && <p className="note text-alarm mt-2">{state.error}</p>}
    </div>
  );
}
