'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';

import { addPatientAction, type AddPatientState } from '@/app/actions/patients';

export function AddPatient({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState<AddPatientState, FormData>(
    async (prev, data) => {
      const result = await addPatientAction(prev, data);
      if (!result.error) setOpen(false);
      return result;
    }, {},
  );

  if (!open) {
    return (
      <button className="btn btn-quiet" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" strokeWidth={1.8} /> Add patient
      </button>
    );
  }

  return (
    // No dismiss-on-backdrop: this is a form, and a stray click while reaching
    // for a field discards a half-typed patient with the person still in the
    // room. Cancel is right there, and nothing else on the page is clickable.
    // On a phone it is the whole screen rather than a card floating on a
    // backdrop: a 440px card inside a 390px screen is mostly margin, and once
    // the keyboard is up a centred dialog puts its own buttons underneath it.
    <div className="fixed inset-0 bg-ink/40 z-40 flex items-stretch justify-center
                    sm:items-start sm:p-4 sm:pt-10 sm:overflow-y-auto">
      <form action={action}
            className="sheet w-full sm:max-w-[440px] p-5
                       h-full overflow-y-auto overscroll-contain
                       rounded-none border-0
                       sm:h-auto sm:max-h-[calc(100svh-5rem)] sm:rounded-[3px] sm:border
                       pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h2 className="text-[17px] font-semibold mb-1">Add a patient</h2>
        <p className="note mb-5">
          Only the name is needed. Their WhatsApp number is how everything reaches
          them, so add it if you have it.
        </p>

        <label className="label block mb-1.5" htmlFor="name">Name</label>
        <input id="name" name="name" className="field mb-4" required autoFocus />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label block mb-1.5" htmlFor="phone">
              WhatsApp number <span className="text-ink-3">· optional</span>
            </label>
            <input id="phone" name="phone" className="field" inputMode="tel"
                   placeholder="91 98765 43210" />
          </div>
          <div>
            <label className="label block mb-1.5" htmlFor="language">Reads best in</label>
            <select id="language" name="language" className="field" defaultValue="hi">
              <option value="hi">हिंदी</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <label className="label block mb-1.5" htmlFor="mrn">
          Hospital number <span className="text-ink-3">· optional</span>
        </label>
        <input id="mrn" name="mrn" className="field mb-4" />

        <label className="label block mb-1.5" htmlFor="notes">
          Clinical note <span className="text-ink-3">· optional</span>
        </label>
        <input id="notes" name="notes" className="field mb-5"
               placeholder="CKD G3b, type 2 diabetes" />

        {state.error && (
          <p role="alert" className="text-[13.5px] text-alarm bg-alarm-wash border border-alarm/30 rounded-[3px] px-3 py-2 mb-4">
            {state.error}
          </p>
        )}

        <div className="flex gap-2">
          <button className="btn btn-primary flex-1 sm:flex-none" disabled={pending}>
            {pending ? 'Adding…' : 'Add patient'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
