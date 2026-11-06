'use client';

import { useActionState, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';

import { deleteDocument, uploadDocument, type UploadState } from '@/app/actions/documents';

export type DocRow = {
  id: string;
  title: string;
  mine: boolean;
  mime: string;
  sizeBytes: number | null;
  blobUrl: string | null;
};

const size = (bytes: number | null) =>
  bytes == null ? '' : bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function DocumentsPanel({ docs }: { docs: DocRow[] }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadDocument, null);
  const [name, setName] = useState<string | null>(null);
  // Derived rather than cleared: once it is in, the button stops naming a file
  // that has already been added, and there is no state to keep in step.
  const chosenName = state?.ok ? null : name;

  const saviora = docs.filter((d) => !d.mine);
  const mine = docs.filter((d) => d.mine);

  return (
    <section className="mt-9">
      <div className="flex items-baseline gap-2.5 mb-1">
        <h2 className="label">Answer material</h2>
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">{docs.length}</span>
      </div>
      <p className="note mb-3 max-w-[62ch]">
        What your assistant is allowed to answer patients from. It quotes these and nothing
        else — a question they do not cover is passed to you instead.
      </p>

      {docs.length > 0 && (
        <ul className="flex flex-col gap-1.5 mb-4">
          {[...saviora, ...mine].map((d) => (
            <li key={d.id} className="sheet px-4 py-2.5 flex items-center gap-3">
              <FileText className="w-4 h-4 text-ink-3 shrink-0" strokeWidth={1.6} />
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {d.blobUrl
                  ? <a href={d.blobUrl} target="_blank" rel="noreferrer" className="hover:text-brand">{d.title}</a>
                  : d.title}
              </span>
              <span className="note text-ink-3 tabular-nums">{size(d.sizeBytes)}</span>
              {d.mine ? (
                <form action={deleteDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="tap tap-pad text-ink-3 hover:text-alarm active:text-alarm" aria-label={`Remove ${d.title}`}>
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
                  </button>
                </form>
              ) : (
                <span className="chip">Saviora</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="sheet p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="doc-title" className="label block mb-1.5">Title (optional)</label>
          <input id="doc-title" name="title" placeholder="e.g. Clinic diet sheet"
                 className="w-full bg-surface border border-rule rounded-[3px] px-3 py-2 text-[16px] [@media(pointer:fine)]:text-[14px]" />
        </div>

        <div>
          <span className="label block mb-1.5">File</span>
          <label className="btn btn-quiet cursor-pointer">
            <Upload className="w-4 h-4" strokeWidth={1.8} />
            {chosenName ?? 'Choose a file'}
            <input type="file" name="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                   className="sr-only"
                   onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
          </label>
        </div>

        <button className="btn" disabled={pending}>{pending ? 'Adding…' : 'Add'}</button>

        <p className="note w-full text-ink-3">
          PDF, text or markdown, up to 10 MB. Only you can see what you add here.
        </p>
        {state?.error && <p className="note w-full text-alarm">{state.error}</p>}
        {state?.ok && <p className="note w-full text-brand">{state.ok}</p>}
      </form>
    </section>
  );
}
