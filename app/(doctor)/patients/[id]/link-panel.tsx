'use client';

import { useActionState } from 'react';
import { Link2 } from 'lucide-react';

import { issueLinkAction, revokeLinkAction, type LinkState } from '@/app/actions/links';

type LinkRow = { id: string; tokenPrefix: string; expiresAt: Date; lastUsedAt: Date | null };

export function LinkPanel({ patientId, hasPhone, links }: {
  patientId: string; hasPhone: boolean; links: LinkRow[];
}) {
  const [state, action, pending] = useActionState<LinkState, FormData>(issueLinkAction, {});

  return (
    <div className="sheet p-4">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-4 h-4 text-brand" strokeWidth={1.7} />
        <h3 className="label">Their link</h3>
      </div>

      {state.url ? (
        <>
          <p className="note mb-2">
            Shown once. We store only a hash of it, so it can&rsquo;t be read back later.
          </p>
          <input readOnly value={state.url} onFocus={(e) => e.currentTarget.select()}
                 aria-label="The patient’s link"
                 className="field font-mono text-[11px] mb-2" />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-quiet py-1.5"
                    onClick={() => navigator.clipboard?.writeText(state.url!)}>
              Copy
            </button>
            {/* Only offered when there is a number to open it against —
                otherwise the button and the note below contradicted each other. */}
            {hasPhone && state.whatsapp && (
              <a className="btn btn-primary py-1.5" href={state.whatsapp}
                 target="_blank" rel="noreferrer">
                Open in WhatsApp
              </a>
            )}
          </div>
          <p className="note mt-2">
            {hasPhone
              ? 'WhatsApp opens with the message ready — you press send. Nothing is sent automatically.'
              : 'No number on file — copy the link and send it yourself.'}
          </p>
        </>
      ) : (
        <>
          <p className="note mb-3">
            Creates a private link to everything you&rsquo;ve sent them. It expires in 90 days
            and you can revoke it any time.
          </p>
          <form action={action}>
            <input type="hidden" name="patientId" value={patientId} />
            <button className="btn btn-primary" disabled={pending}>
              {pending ? 'Creating…' : 'Create link'}
            </button>
          </form>
          {state.error && <p className="note text-alarm mt-2">{state.error}</p>}
        </>
      )}

      {links.length > 0 && (
        <div className="mt-4 pt-3 border-t border-rule-soft">
          <div className="label mb-2">Active links</div>
          <ul className="space-y-1.5">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3">
                <span className="note font-mono">
                  {link.tokenPrefix}…{' '}
                  {link.lastUsedAt ? 'opened' : 'never opened'}
                </span>
                <form action={revokeLinkAction}>
                  <input type="hidden" name="linkId" value={link.id} />
                  <button className="btn btn-alarm py-0.5 px-2 text-[12px]">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
