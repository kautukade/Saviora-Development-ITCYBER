'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/lib/copy';

/**
 * A YouTube video, played inside Saviora, reporting how far the patient got.
 *
 * "They opened the link" and "they watched eighty percent" are very different
 * facts for a doctor about to walk into a consultation, and because we host the
 * page the second costs no more than the first.
 *
 * Reporting is deliberately sparing: on start, when the furthest point advances
 * by five percent, at the end, and once more when the page is hidden — patients
 * are on mobile data, and a request every second would be rude.
 */

type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  mute(): void;
  unMute(): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoading: Promise<void> | null = null;

/**
 * Loading YouTube's player API, with a deadline.
 *
 * On a slow connection the script can simply never arrive, and a promise that
 * never settles leaves the patient looking at a black rectangle with no
 * message and no way out. Worse, the promise is cached at module scope, so one
 * bad load would poison every panel in the feed. A rejection clears the cache,
 * so scrolling away and back is a real retry.
 */
function loadApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;

  apiLoading = new Promise<void>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => reject(new Error('youtube api failed'));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('youtube api timed out')), 12000);
  }).catch((err) => {
    apiLoading = null;
    throw err;
  });
  return apiLoading;
}

/**
 * Which videos have already been counted as opened this session.
 *
 * The feed unmounts a player the moment it scrolls out of view, so without
 * this a patient who scrolls down and back up reports the same section opened
 * three times, and the doctor's engagement figures quietly inflate.
 */
const opened = new Set<string>();

export function VideoPlayer({
  token, assignmentId, videoId, language, startPercent, durationSeconds,
  autoplay = false, muted = false, wantPlaying = true, fill = false, onEnded, onReady,
}: {
  token: string; assignmentId: string; videoId: string;
  language: string; startPercent: number;
  /** Needed to turn a percentage back into the second to resume from. */
  durationSeconds?: number | null;
  /** Start on mount. */
  autoplay?: boolean;
  /**
   * Start silent. Browsers refuse to autoplay audio until the person has
   * interacted with the page, so the feed opens muted and the first tap
   * anywhere turns the sound on.
   */
  muted?: boolean;
  /**
   * Whether it should be playing. Held by the panel so a tap anywhere on the
   * screen reaches it, and reconciled against what the player is actually
   * doing rather than assumed — see below.
   */
  wantPlaying?: boolean;
  /** Fill the panel it is in, rather than sitting in a 16:9 card. */
  fill?: boolean;
  onEnded?: () => void;
  /** Fired once the iframe is showing something, so a poster can be removed. */
  onReady?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const furthest = useRef(startPercent);
  const reported = useRef(startPercent);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Read inside the player's own callbacks, which are built once and would
  // otherwise close over the first value of these props forever.
  const mutedRef = useRef(muted);
  const wantRef = useRef(wantPlaying);
  useEffect(() => { mutedRef.current = muted; wantRef.current = wantPlaying; });
  // Held in a ref so a changing callback never tears down the player mid-play.
  const onEndedRef = useRef(onEnded);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onEndedRef.current = onEnded; onReadyRef.current = onReady; });

  // Neither of these is in the main effect's dependencies: rebuilding the
  // player to change its volume or stop it would restart the video the patient
  // is in the middle of.
  useEffect(() => {
    if (!muted) {
      player.current?.unMute?.();
      // Safari can leave a muted autoplay paused; unmuting after a real tap is
      // the moment it will accept a play.
      player.current?.playVideo?.();
    }
  }, [muted]);

  /**
   * Make what it is doing match what was asked.
   *
   * Comparing against `playing` rather than just acting on the intent is what
   * makes a blocked autoplay heal itself: the player reports it is not playing,
   * this notices the mismatch and asks again. Acting blindly instead is how a
   * tap ended up pausing a video that had never started, so the patient had to
   * tap twice to get anywhere.
   */
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (wantPlaying && !playing) p.playVideo?.();
    if (!wantPlaying && playing) p.pauseVideo?.();
  }, [wantPlaying, playing]);

  const report = useCallback((type: 'opened' | 'progress' | 'completed', percent?: number, position?: number) => {
    const body = JSON.stringify({ assignmentId, type, percent, positionSeconds: position });
    const url = `/api/patient/${token}/progress`;
    // sendBeacon survives the page being closed, which is exactly when the last
    // and most useful progress report would otherwise be lost.
    if (type !== 'opened' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  }, [assignmentId, token]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    // Held locally: by the time cleanup runs, the ref may already point
    // somewhere else, and the wrapper that needs emptying is this one.
    const wrapper = mount.current;

    loadApi().then(() => {
      if (cancelled || !mount.current || !window.YT) { setFailed(!window.YT); return; }

      if (!opened.has(assignmentId)) {
        opened.add(assignmentId);
        report('opened');
      }

      const tick = () => {
        const p = player.current;
        if (!p) return;
        const duration = p.getDuration();
        if (!duration) return;
        const percent = (p.getCurrentTime() / duration) * 100;
        if (percent > furthest.current) furthest.current = percent;
        if (furthest.current - reported.current >= 5) {
          reported.current = furthest.current;
          report('progress', furthest.current, p.getCurrentTime());
        }
      };

      // Scrolling one panel away and back destroys the player and builds a new
      // one. Without this, a patient who had watched seventy of eighty seconds
      // is put back at zero and made to spend the data again.
      const resumeAt = durationSeconds && startPercent > 2 && startPercent < 95
        ? Math.floor((durationSeconds * startPercent) / 100)
        : 0;

      // YouTube REPLACES the element it is handed with an iframe. Give it the
      // div React is holding and React's reference points at a node that is no
      // longer in the tree — the next unmount calls removeChild on it, throws
      // "The node to be removed is not a child of this node", and the whole
      // page falls to the error boundary. Scrolling one panel was enough.
      // So it gets a child React has never seen and does not manage.
      const host = document.createElement('div');
      host.style.width = '100%';
      host.style.height = '100%';
      mount.current.appendChild(host);

      player.current = new window.YT.Player(host, {
        videoId,
        playerVars: {
          // Nothing of YouTube's is wanted here. controls:0 removes the bar,
          // the seek line and the channel watermark; iv_load_policy hides
          // annotations; fs removes the fullscreen button; rel:0 keeps the end
          // screen from offering somebody else's videos. The avatar and title
          // that YouTube paints over the top on interaction are handled by the
          // player never being interacted with — see the tap layer below.
          controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
          rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin,
          autoplay: autoplay ? 1 : 0,
          // Always muted at construction. A browser blocks autoplay with sound
          // no matter how many times the person has tapped elsewhere on the
          // page — the gesture does not carry into a freshly built iframe — so
          // an unmuted autoplay simply never starts, and the patient is left
          // looking at YouTube's play button. It is unmuted on ready instead.
          mute: 1,
          start: resumeAt,
        },
        events: {
          onReady: () => {
            const p = player.current;
            if (mutedRef.current === false) p?.unMute?.();
            p?.playVideo?.();
            onReadyRef.current?.();
          },
          onStateChange: (event: { data: number }) => {
            setPlaying(event.data === window.YT?.PlayerState.PLAYING);
            if (event.data === window.YT?.PlayerState.ENDED) {
              furthest.current = 100;
              reported.current = 100;
              report('completed', 100);
              onEndedRef.current?.();
            }
          },
          onError: () => setFailed(true),
        },
      });

      interval = setInterval(tick, 5000);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });

    const flush = () => {
      if (furthest.current > reported.current) {
        reported.current = furthest.current;
        report('progress', furthest.current);
      }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      flush();
      player.current?.destroy?.();
      player.current = null;
      // destroy() takes the iframe with it, but a failed load can leave the
      // host behind; a remount must start from an empty wrapper.
      wrapper?.replaceChildren();
    };
    // Deliberately not depending on autoplay, startPercent or durationSeconds:
    // they are read once when the player is built, and re-running this would
    // tear down a playing video underneath the patient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, videoId]);

  if (failed) {
    // Carries its own colours. Inside the reel this inherits near-white text,
    // and .sheet is a near-white background — the one message a patient ever
    // gets was invisible.
    return (
      <div className={`px-5 py-8 text-center bg-[#12293a] ${fill ? 'h-full flex items-center justify-center' : 'rounded-[6px]'}`}>
        <p className="text-[15px] leading-relaxed text-[#eef1f4]">{t('videoUnavailable', language)}</p>
      </div>
    );
  }

  if (fill) {
    return (
      // The caller clips this to the video's own 16:9 box. The player is given
      // 96px more height than that box at the top and the bottom, so YouTube's
      // furniture — the channel avatar, the video title, the caption strip, the
      // logo — is drawn in the letterbox bands OUTSIDE the visible area and
      // never reaches the screen. The video itself is fitted to the width, so
      // it lands exactly in the window that is showing. Nothing is cropped.
      //
      // pointer-events-none finishes the job: most of that furniture only
      // appears on interaction, and the player is never interacted with. Taps
      // are handled above and reach the video through the API.
      <div className="absolute inset-x-0 -top-24 -bottom-24 pointer-events-none">
        <div ref={mount} className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className="rounded-[3px] overflow-hidden border border-rule bg-ink">
      <div className="aspect-video">
        <div ref={mount} className="w-full h-full" />
      </div>
    </div>
  );
}
