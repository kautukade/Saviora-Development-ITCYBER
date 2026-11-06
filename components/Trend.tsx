import type { Series } from '@/lib/labs';

/**
 * One test, measured against its own reference range.
 *
 * Small multiples, never a shared axis: creatinine in mg/dL beside eGFR in
 * mL/min/1.73m² on one pair of axes would read as a comparison and is not one.
 * Each test gets its own scale, its own band, and its own card.
 *
 * The band is the point. A clinician does not read 2.14 in the abstract, they
 * read it against 0.6–1.3 — so the reference range is drawn as the ground the
 * line sits on, which also means a single reading is still worth a chart.
 *
 * Colour never carries a status alone. Out of range gets the H or L that the
 * lab report itself prints, and critical gets a chip — because #a8271d and
 * #8a5a10 are 2.2 ΔE apart under deuteranopia, which is to say identical.
 */

const W = 260;
const H = 74;
const PAD = { top: 10, right: 10, bottom: 10, left: 10 };

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));

const day = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** H or L, as a lab report prints it — the encoding a clinician already reads. */
function marker(p: { value: number }, s: Series): 'H' | 'L' | null {
  if (s.normalHigh != null && p.value > s.normalHigh) return 'H';
  if (s.normalLow != null && p.value < s.normalLow) return 'L';
  return null;
}

const tone = (flag: string | null) =>
  flag === 'critical' || flag === 'delta' ? 'var(--color-alarm)'
  : flag ? 'var(--color-attend)'
  : 'var(--color-ink)';

export function Trend({ series }: { series: Series }) {
  const pts = series.points;
  const latest = pts[pts.length - 1];
  const previous = pts.length > 1 ? pts[pts.length - 2] : null;

  // Scale to the readings first, and only then let the reference range pull the
  // view — and not far. Fitting the whole band every time flattened the line
  // that matters: a creatinine going 1.62 to 2.14 drew as a horizontal stroke
  // because the band sat well below it and ate the height. The band is context;
  // the change is the finding.
  const values = pts.map((p) => p.value);
  const dataLo = Math.min(...values);
  const dataHi = Math.max(...values);
  const span = (dataHi - dataLo) || Math.abs(dataHi) * 0.3 || 1;

  const reach = span * 1.4;                         // how far the band may pull
  const wanted = [
    ...(series.normalLow != null ? [series.normalLow] : []),
    ...(series.normalHigh != null ? [series.normalHigh] : []),
  ];
  let lo = dataLo - span * 0.35;
  let hi = dataHi + span * 0.35;
  for (const v of wanted) {
    if (v < lo) lo = Math.max(v - span * 0.15, dataLo - reach);
    if (v > hi) hi = Math.min(v + span * 0.15, dataHi + reach);
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const x = (i: number) => pts.length === 1
    ? PAD.left + plotW              // a single reading sits at "now", on the right
    : PAD.left + (i / (pts.length - 1)) * plotW;

  // Clipped to the plot: a band running past an edge is drawn as reaching it,
  // which reads correctly as "normal continues beyond here".
  const clamp = (v: number) => Math.max(PAD.top, Math.min(PAD.top + plotH, v));
  const bandTop = clamp(series.normalHigh != null ? y(series.normalHigh) : PAD.top);
  const bandBottom = clamp(series.normalLow != null ? y(series.normalLow) : PAD.top + plotH);

  const m = marker(latest, series);
  const critical = latest.flag === 'critical' || latest.flag === 'delta';
  const change = previous && previous.value !== 0
    ? Math.round(((latest.value - previous.value) / previous.value) * 100) : null;

  return (
    <figure className="sheet p-4 m-0">
      <figcaption className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[13px] font-medium leading-tight">{series.name}</span>
        {critical && <span className="chip border-alarm/50 text-alarm">Critical</span>}
      </figcaption>

      <div className="flex items-baseline gap-1.5">
        <span className="font-mono tabular-nums text-[22px] leading-none"
              style={{ color: tone(latest.flag) }}>
          {fmt(latest.value)}
        </span>
        {m && (
          <span className="font-mono text-[12px] font-semibold" style={{ color: tone(latest.flag) }}>
            {m}
          </span>
        )}
        <span className="note text-ink-3">{series.unit}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img"
           aria-label={`${series.name}: ${pts.map((p) => `${fmt(p.value)} ${series.unit} on ${day(p.at)}`).join('; ')}.${
             series.normalLow != null || series.normalHigh != null
               ? ` Reference range ${series.normalLow ?? ''}–${series.normalHigh ?? ''} ${series.unit}.` : ''}`}>
        {/* The reference range, as recessive ground rather than a marked line. */}
        <rect x={PAD.left} y={Math.min(bandTop, bandBottom)} width={plotW}
              height={Math.max(2, Math.abs(bandBottom - bandTop))}
              fill="var(--color-accent-wash)" />
        {series.normalLow != null && bandBottom < PAD.top + plotH && (
          <line x1={PAD.left} x2={W - PAD.right} y1={bandBottom} y2={bandBottom}
                stroke="var(--color-rule)" strokeWidth="1" />
        )}
        {series.normalHigh != null && bandTop > PAD.top && (
          <line x1={PAD.left} x2={W - PAD.right} y1={bandTop} y2={bandTop}
                stroke="var(--color-rule)" strokeWidth="1" />
        )}

        {pts.length > 1 && (
          <polyline
            points={pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
            fill="none" stroke="var(--color-ink-2)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        )}

        {pts.map((p, i) => (
          <g key={i}>
            {/* A surface ring keeps a point legible where it crosses the line. */}
            <circle cx={x(i)} cy={y(p.value)} r="5.5" fill="var(--color-surface)" />
            <circle cx={x(i)} cy={y(p.value)} r="4" fill={tone(p.flag)}>
              <title>{`${fmt(p.value)} ${series.unit} — ${day(p.at)}`}</title>
            </circle>
          </g>
        ))}
      </svg>

      {/* "Range" and "since" were the words that pushed this line past the card
          edge. Both are inferable from what they sit beside. */}
      <div className="note text-ink-3 mt-1 flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap tabular-nums">
          {series.normalLow != null && series.normalHigh != null
            ? `${fmt(series.normalLow)}–${fmt(series.normalHigh)}`
            : series.normalHigh != null ? `< ${fmt(series.normalHigh)}`
            : series.normalLow != null ? `> ${fmt(series.normalLow)}` : ''}
        </span>
        <span className="tabular-nums whitespace-nowrap">
          {change != null && previous
            ? `${change > 0 ? '+' : ''}${change}% from ${fmt(previous.value)} · ${day(latest.at)}`
            : day(latest.at)}
        </span>
      </div>
    </figure>
  );
}

export function Trends({ series }: { series: Series[] }) {
  if (series.length === 0) return null;
  return (
    <section className="mt-7">
      <h2 className="label mb-1">Trends</h2>
      <p className="note mb-3">
        Each test against its own reference range. Only values the patient confirmed.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {series.map((s) => <Trend key={s.analyte} series={s} />)}
      </div>
    </section>
  );
}
