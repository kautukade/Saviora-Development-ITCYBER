'use client';

import { useActionState } from 'react';

import { signInAction, type SignInState } from '@/app/actions/auth';
import { Mark, Wordmark } from '@/components/Mark';

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.3fr_1fr]">
      {/* The thesis, stated once. No progress bar here — there is no last visit
          to measure yet, and a device that shows invented data is decoration. */}
      <aside className="hidden lg:grid grid-rows-[auto_1fr_auto] p-14 border-r border-rule">
        <Wordmark />

        {/* Widths in rem, not ch: `ch` resolves against the container's font
            size, so a cap meant for 40px display type came out half as wide. */}
        <div className="self-center max-w-[32rem]">
          <p className="font-display text-[44px] leading-[1.12] tracking-[-0.015em]">
            The consultation ends. The questions don&rsquo;t.
          </p>
          <p className="text-[15.5px] text-ink-2 mt-7 leading-relaxed max-w-[30rem]">
            Saviora covers the weeks in between — what you asked them to watch, what they
            asked you, and what their reports said — so you walk into the next visit already
            knowing.
          </p>
        </div>

        <p className="label">Saviora</p>
      </aside>

      <main className="flex items-center justify-center px-8 py-12">
        <form action={action} className="w-full max-w-[320px]">
          <div className="lg:hidden mb-8"><Wordmark /></div>
          <div className="hidden lg:block text-brand mb-6"><Mark className="w-6 h-6" /></div>

          <h1 className="text-[24px] font-semibold leading-snug">Sign in</h1>
          <p className="note mt-1 mb-7">For doctors using Saviora with their patients.</p>

          <label className="label block mb-1.5" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username"
                 className="field mb-4" required autoFocus />

          <label className="label block mb-1.5" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password"
                 className="field mb-5" required />

          {state.error && (
            <p role="alert"
               className="text-[13.5px] text-alarm border border-alarm/30 bg-alarm-wash rounded-[3px] px-3 py-2 mb-4 leading-snug">
              {state.error}
            </p>
          )}

          <button className="btn btn-primary w-full py-2.5" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>

        </form>
      </main>
    </div>
  );
}
