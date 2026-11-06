import Image from 'next/image';

/**
 * The Saviora mark — the real one, shared with the public site so the app and
 * the brand cannot drift apart.
 *
 * It is a raster with its own colours, so unlike the drawn mark it does not
 * inherit `currentColor`; size it, do not try to tint it.
 */
export function Mark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      aria-hidden="true"
      width={420}
      height={337}
      priority
      className={`${className} object-contain`}
    />
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className="w-[26px] h-[26px]" />
      <span className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
        Saviora
      </span>
    </span>
  );
}

/**
 * The same dimension line, used for real information: how much of a span has
 * been covered. Progress through a video, sections watched, weeks elapsed.
 */
export function Interval({ filled, total, className = '' }: {
  filled: number; total: number; className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
    >
      <span className="w-px h-3 bg-rule" />
      <span className="relative h-px w-full min-w-10 bg-rule">
        <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%`, height: 3, top: -1 }} />
      </span>
      <span className="w-px h-3 bg-rule" />
    </span>
  );
}
