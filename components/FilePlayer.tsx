'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * A video the doctor uploaded, played directly.
 *
 * The counterpart of VideoPlayer, which drives a YouTube iframe. This one is a
 * plain <video> element, and is the simpler of the two by a distance: there is
 * no third-party API to load, no player chrome to hide, and nothing on screen
 * that belongs to anybody else.
 *
 * Progress is reported on the same terms — on start, every five percent of new
 * ground, at the end, and once more when the page is hidden — so the doctor's
 * figures mean the same thing whichever kind of video it was.
 */
export function FilePlayer({
  token, assignmentId, url, startPercent, muted, paused, onReady, onEnded,
}: {
  token: string;
  assignmentId: string;
  url: string;
  startPercent: number;
  muted: boolean;
  paused: boolean;
  onReady?: () => void;
  onEnded?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const furthest = useRef(startPercent);
  const reported = useRef(startPercent);
  const seeded = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onEndedRef.current = onEnded; onReadyRef.current = onReady; });

  const report = useCallback((type: 'opened' | 'progress' | 'completed', percent?: number, position?: number) => {
    const body = JSON.stringify({ assignmentId, type, percent, positionSeconds: position });
    const path = `/api/patient/${token}/progress`;
    // sendBeacon survives the page closing, which is exactly when the last and
    // most useful report would otherwise be lost.
    if (type !== 'opened' && navigator.sendBeacon) {
      navigator.sendBeacon(path, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  }, [assignmentId, token]);

  useEffect(() => {
    report('opened');
    const flush = () => {
      if (furthest.current > reported.current) {
        reported.current = furthest.current;
        report('progress', furthest.current, video.current?.currentTime);
      }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [report]);

  // Muting and pausing are driven from the panel, and neither may rebuild the
  // element — that would restart the video underneath the patient.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = muted;
    if (paused) el.pause();
    else void el.play().catch(() => { /* a browser may still refuse; the tap layer retries */ });
  }, [muted, paused]);

  return (
    <video
      ref={video}
      src={url}
      className="w-full h-full object-contain pointer-events-none"
      playsInline
      autoPlay
      muted={muted}
      preload="metadata"
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        // Put them back where they got to, once — the same courtesy the
        // YouTube path gets, and for the same reason: they paid for that data.
        if (!seeded.current && startPercent > 2 && startPercent < 95 && el.duration) {
          el.currentTime = (el.duration * startPercent) / 100;
        }
        seeded.current = true;
        onReadyRef.current?.();
      }}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        if (!el.duration) return;
        const percent = (el.currentTime / el.duration) * 100;
        if (percent > furthest.current) furthest.current = percent;
        if (furthest.current - reported.current >= 5) {
          reported.current = furthest.current;
          report('progress', furthest.current, el.currentTime);
        }
      }}
      onEnded={() => {
        furthest.current = 100;
        reported.current = 100;
        report('completed', 100);
        onEndedRef.current?.();
      }}
    />
  );
}
