'use client';

import { useEffect, useRef } from 'react';

/**
 * Written content has no playhead, so "how far did they get" is measured by how
 * far down the page they reached. Reported on the same sparing schedule as the
 * video, and marked complete once the end of the text has been on screen.
 */
export function ReadTracker({ token, assignmentId }: { token: string; assignmentId: string }) {
  const furthest = useRef(0);
  const reported = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    const url = `/api/patient/${token}/progress`;
    const send = (type: 'opened' | 'progress' | 'completed', percent?: number) => {
      const body = JSON.stringify({ assignmentId, type, percent });
      if (type !== 'opened' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }
      void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    };

    send('opened');

    const measure = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      // A page shorter than the viewport has nothing to scroll, so reaching it
      // at all is reaching the end of it.
      const percent = scrollable <= 8 ? 100 : (window.scrollY / scrollable) * 100;
      if (percent > furthest.current) furthest.current = Math.min(100, percent);

      if (furthest.current >= 95 && !done.current) {
        done.current = true;
        send('completed', 100);
      } else if (furthest.current - reported.current >= 10) {
        reported.current = furthest.current;
        send('progress', furthest.current);
      }
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('pagehide', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('pagehide', measure);
      if (!done.current && furthest.current > reported.current) send('progress', furthest.current);
    };
  }, [assignmentId, token]);

  return null;
}
