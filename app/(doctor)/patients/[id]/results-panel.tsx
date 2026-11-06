import { AlertTriangle, FileWarning, Hourglass } from 'lucide-react';

import type { ResultView } from '@/lib/labs';

/**
 * Out of range colours the number; only critical and delta get a chip.
 *
 * An earlier version chipped every out-of-range value, which put an amber mark
 * on seven of nine rows in an ordinary CKD panel — the one row that mattered
 * was indistinguishable from the six that did not.
 */
function Row({ v }: { v: ResultView['values'][number] }) {
  const urgent = v.flag === 'critical' || v.flag === 'delta';
  const off = v.flag === 'out_of_range';

  const chip = urgent && (
    <span className="chip border-alarm/50 text-alarm">
      {v.flag === 'critical' ? 'Critical' : 'Changed'}
    </span>
  );

  return (
    // Below sm the four columns collapse to one line — analyte on the left,
    // number and unit on the right — with the chip on its own line beneath,
    // because .chip cannot wrap and was the cell pushing the row wide.
    <tr className="block sm:table-row border-t border-rule-soft">
      <td className="block sm:table-cell py-2 sm:py-1.5 sm:pr-4 text-[14px]">
        <span className="flex items-baseline justify-between gap-3 sm:block">
          <span className="min-w-0">{v.name}</span>
          <span className={`sm:hidden shrink-0 font-mono tabular-nums ${
            urgent ? 'text-alarm font-semibold' : off ? 'text-attend' : ''}`}>
            {v.value} <span className="text-ink-3">{v.unit}</span>
          </span>
        </span>
        {chip && <span className="sm:hidden block mt-1">{chip}</span>}
      </td>
      <td className={`hidden sm:table-cell py-1.5 pr-2 text-right font-mono tabular-nums text-[14px] ${
        urgent ? 'text-alarm font-semibold' : off ? 'text-attend' : ''}`}>
        {v.value}
      </td>
      <td className="hidden sm:table-cell py-1.5 pr-4 note text-ink-3">{v.unit}</td>
      <td className="hidden sm:table-cell py-1.5">{chip}</td>
    </tr>
  );
}

const STATUS: Record<string, { note: string; icon: typeof Hourglass }> = {
  extracted:  { note: 'Read from the photo. Waiting for the patient to confirm — nothing is in the record yet.', icon: Hourglass },
  unreadable: { note: 'The photo could not be read. It is worth looking at yourself.', icon: FileWarning },
  rejected:   { note: 'The patient says these values were read wrong. Please check the report.', icon: AlertTriangle },
};

export function ResultsPanel({ results }: { results: ResultView[] }) {
  if (results.length === 0) {
    return (
      <section>
        <h2 className="label mb-2">Results</h2>
        <div className="sheet px-5 py-6 text-center">
          <p className="note">
            Nothing yet. When they photograph a report on WhatsApp, the values appear here
            once they have confirmed them.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="label mb-2">Results</h2>
      <div className="flex flex-col gap-2.5">
        {results.map((r) => {
          const state = STATUS[r.status];
          const Icon = state?.icon;
          return (
            <div key={r.id} className="sheet p-4">
              <div className="flex items-baseline justify-between gap-4 mb-1">
                <span className="text-[14px] font-medium">{r.labName ?? 'Lab report'}</span>
                <span className="note text-ink-3">
                  {(r.confirmedAt ?? r.at).toLocaleDateString('en-IN',
                    { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {state && (
                <p className="note text-ink-2 flex items-start gap-1.5 mb-2">
                  {Icon && <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.8} />}
                  {state.note}
                </p>
              )}

              {r.values.length > 0 && (
                <table className="w-full">
                  <tbody>{r.values.map((v) => <Row key={v.analyte} v={v} />)}</tbody>
                </table>
              )}

              {r.blobUrl && (
                <a href={r.blobUrl} target="_blank" rel="noreferrer"
                   className="note inline-block mt-2 hover:text-brand underline underline-offset-2">
                  Open the photo they sent
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
