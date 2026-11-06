'use client';

import { useActionState } from 'react';

import { changePasswordAction, type PasswordState } from '@/app/actions/auth';

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(
    changePasswordAction, {},
  );

  return (
    <form action={action} className="flex flex-col gap-3.5 max-w-[320px]">
      <div>
        <label htmlFor="current" className="label block mb-1.5">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password"
               required className="field" />
      </div>

      <div>
        <label htmlFor="next" className="label block mb-1.5">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password"
               required minLength={10} className="field" />
        <p className="note mt-1 text-ink-3">At least 10 characters.</p>
      </div>

      <button className="btn self-start" disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </button>

      {state.error && <p className="note text-alarm">{state.error}</p>}
      {state.done && <p className="note text-brand">Changed. Use it next time you sign in.</p>}
    </form>
  );
}
