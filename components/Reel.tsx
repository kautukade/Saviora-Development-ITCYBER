'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronUp, MessageCircle, Volume2 } from 'lucide-react';

import { FilePlayer } from '@/components/FilePlayer';
import { VideoPlayer } from '@/components/VideoPlayer';
import { t } from '@/lib/copy';
import type { AssignedItem } from '@/lib/content';

/**
 * Everything the doctor sent, as one thing you swipe through.
 *
 * Shaped like Shorts, because that is the only video interface most patients
 * already know: one section per screen, edge to edge, playing the moment it
 * arrives, everything else floating over it. The sections are twenty to eighty
 * seconds each, which is reel length, and a list of eight cards asks a patient
 * to choose eight times. A feed asks once.
 *
 * Only the panel in view is mounted, so eight YouTube players never exist at
 * the same time on a phone's data.
 *
 * Sound is the one thing that cannot simply be switched on. Browsers refuse to
 * autoplay audio until the person has interacted with the page, and a video
 * that plays silently is a video about nothing — the narration IS the content.
 * So it opens muted and playing, says so, and the first tap anywhere turns the
 * sound on for the rest of the feed.
 */

/**
 * "What is CKD? — Chapter 1" on every panel is the course name eight times and
 * the useful half in small print. Split on the dash: the course becomes a quiet
 * eyebrow, the section becomes the heading. Anything without a dash keeps its
 * whole title and gets no eyebrow.
 */
function splitTitle(title: string): { course: string | null; section: string } {
  const at = title.indexOf(' — ');
  if (at === -1) return { course: null, section: title };
  return { course: title.slice(0, at), section: title.slice(at + 3) };
}

/**
 * The thumbnail, standing in for the video.
 *
 * mqdefault is 320x180 and genuinely 16:9. hqdefault is 480x360 with black
 * bars baked into the image, three times the bytes, for a slot no wider than
 * the phone this is read on.
 */
function Poster({ src, eager }: { src: string; eager: boolean }) {
  return (
    // YouTube's CDN already serves the exact size asked for, so routing this
    // through the image optimiser would add a round-trip per panel and save
    // nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={320}
      height={180}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
    />
  );
}

/**
 * The panel in view: a real player, with the thumbnail held over it until it
 * has something to show.
 *
 * Its own component so that "has the player painted yet" dies when the panel
 * scrolls away. The player is destroyed on the way out, so next time round it
 * is loading again and the poster has to come back with it — automatic, if the
 * state was never allowed to outlive the player.
 */
function Live({ poster, videoUrl, ...player }: {
  poster: string | null;
  /** Set when the doctor uploaded the file instead of linking to YouTube. */
  videoUrl: string | null;
  token: string;
  assignmentId: string;
  videoId: string;
  language: string;
  startPercent: number;
  durationSeconds: number | null;
  autoplay: boolean;
  muted: boolean;
  wantPlaying: boolean;
  onEnded: () => void;
}) {
  const [painted, setPainted] = useState(false);

  return (
    <>
      {videoUrl ? (
        // A video the doctor uploaded. No iframe, no third-party API, and
        // nothing on the screen belonging to anyone else.
        <FilePlayer
          token={player.token}
          assignmentId={player.assignmentId}
          url={videoUrl}
          startPercent={player.startPercent}
          muted={player.muted}
          paused={!player.wantPlaying}
          onReady={() => setPainted(true)}
          onEnded={player.onEnded}
        />
      ) : (
        <VideoPlayer {...player} fill onReady={() => setPainted(true)} />
      )}
      {poster && !painted && <Poster src={poster} eager />}
      {!painted && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-8 h-8 rounded-full border-2 border-white/25 border-t-white animate-spin" />
        </span>
      )}
    </>
  );
}

/**
 * One section of the feed: the video edge to edge, everything else over it.
 *
 * The videos are filmed in 16:9 and a phone is 9:16, so the player letterboxes
 * itself. Rather than fight that with a cropped, half-lost frame, the black it
 * leaves is where the title and the progress live — which is what Shorts does
 * with a landscape video too.
 */
function Panel({
  item, index, items, token, language,
  isActive, isNext, sound, done, onRef, onFinish, onNext, onSound, header,
}: {
  item: AssignedItem;
  index: number;
  items: AssignedItem[];
  token: string;
  language: string;
  isActive: boolean;
  /** The panel directly below the one playing — worth fetching early. */
  isNext: boolean;
  sound: boolean;
  done: Set<string>;
  onRef: (el: HTMLElement | null) => void;
  onFinish: () => void;
  onNext: () => void;
  onSound: () => void;
  /** Shown over the first panel only: who this came from. */
  header: string | null;
}) {
  const [wantPlaying, setWantPlaying] = useState(true);
  const onTap = () => {
    // The first tap is spent on sound: browsers refuse to play audio before
    // somebody has touched the page, and the narration is the content.
    if (!sound) { onSound(); return; }
    setWantPlaying((p) => !p);
  };

  // A panel scrolled away stops; scrolled back to, it starts again. Without
  // this, pausing one section would leave every later one paused too.
  // Adjusted during render rather than in an effect: React's own pattern for
  // resetting state when a prop changes, and it avoids a frame where the panel
  // is live but still holding the last one's paused state.
  const [wasActive, setWasActive] = useState(isActive);
  if (wasActive !== isActive) {
    setWasActive(isActive);
    setWantPlaying(true);
  }

  const finished = done.has(item.assignmentId);
  const { course, section } = splitTitle(item.title);
  const next = items[index]; // index is 1-based, so this is the one after
  // Only YouTube gives us a thumbnail for free. An uploaded file shows its own
  // first frame, which is what preload="metadata" is for.
  const poster = item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg` : null;

  return (
    <section
      data-index={index}
      ref={onRef}
      className="h-svh snap-start snap-always relative bg-black overflow-hidden"
    >
      {/* The video, centred, and clipped to exactly its own 16:9 box. The
          player inside is taller than this, which is what keeps YouTube's
          avatar, title and logo off the screen — they are drawn in the bands
          that fall outside. */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 aspect-video overflow-hidden">
        {isActive ? (
          <Live
            token={token}
            assignmentId={item.assignmentId}
            videoId={item.videoId ?? ''}
            videoUrl={item.videoUrl}
            language={language}
            startPercent={item.percent}
            durationSeconds={item.durationSeconds}
            autoplay
            muted={!sound}
            wantPlaying={wantPlaying}
            onEnded={onFinish}
            poster={poster}
          />
        ) : (
          poster && <Poster src={poster} eager={isNext} />
        )}
      </div>

      {/* One tap layer over the whole screen, not just the video: the first tap
          turns the sound on, and every tap after that stops and starts it. */}
      <button type="button" onClick={onTap}
              aria-label={sound ? t(wantPlaying ? 'pause' : 'play', language) : t('tapForSound', language)}
              className="absolute inset-0 z-[5] w-full h-full" />

      {!wantPlaying && (
        <span className="absolute inset-0 z-[6] flex items-center justify-center bg-black/40 pointer-events-none">
          <span className="w-16 h-16 rounded-full bg-black/55 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-7 h-7 ml-0.5" fill="white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      )}

      {/* Where you are in the whole thing, along the very top. */}
      <div className="absolute top-0 inset-x-0 z-10 flex gap-[3px] px-2
                      pt-[max(0.5rem,env(safe-area-inset-top))]"
           aria-hidden="true">
        {items.map((other, k) => (
          <span key={other.assignmentId}
                className={`h-[3px] flex-1 rounded-full ${
                  k === index - 1 ? 'bg-white'
                  : done.has(other.assignmentId) ? 'bg-[#00c9ad]'
                  : 'bg-white/25'}`} />
        ))}
      </div>

      {/* Who sent it. First panel only, and only until they have scrolled. */}
      {header && (
        <p className="absolute top-0 inset-x-0 z-10 text-center px-6
                      pt-[max(1.75rem,calc(env(safe-area-inset-top)+1.25rem))]
                      text-[13px] text-white/80 drop-shadow pointer-events-none">
          {header}
        </p>
      )}

      {/* Everything else sits over the video, on a scrim so it stays readable
          whatever frame is behind it. */}
      <div className="absolute bottom-0 inset-x-0 z-10 px-4
                      pb-[max(1rem,env(safe-area-inset-bottom))] pt-16
                      bg-gradient-to-t from-black/85 via-black/45 to-transparent">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {course && (
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">{course}</p>
            )}
            <h2 className="text-[19px] font-semibold leading-snug text-white mt-1">{section}</h2>
          </div>
          {finished && (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-[#7fd3c1] text-[13px]">
              <Check className="w-4 h-4" strokeWidth={2.4} />
              {t('done', language)}
            </span>
          )}
        </div>

        {/* Naming what is next is what makes the next swipe happen. */}
        <button type="button" onClick={onNext}
                className="mt-1 -mb-1 py-2 min-h-[44px] flex items-center gap-2 text-left
                           text-white/65 active:text-white transition-colors">
          <ChevronUp className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span className="text-[13px] truncate">
            {next ? `${t('next', language)} · ${splitTitle(next.title).section}` : t('lastOne', language)}
          </span>
        </button>
      </div>
    </section>
  );
}

export function Reel({ token, items, language, doctorName, patientName, askUrl }: {
  token: string;
  items: AssignedItem[];
  language: string;
  doctorName: string;
  patientName: string;
  askUrl: string | null;
}) {
  // Videos only. Saviora's written pieces are retired, but a patient sent one
  // before that still has it on their list, and a feed is not where anybody
  // reads an article.
  const watchable = items.filter((i) => i.kind === 'video' && (i.videoId || i.videoUrl));

  const [active, setActive] = useState(1);
  const [sound, setSound] = useState(false);
  const [done, setDone] = useState<Set<string>>(
    () => new Set(watchable.filter((i) => i.status === 'completed').map((i) => i.assignmentId)),
  );
  const panels = useRef<(HTMLElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  // Which panel is on screen. Content starts at 1; the end card is last.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root: scroller.current, threshold: 0.6 },
    );
    panels.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [watchable.length]);

  const goTo = (i: number) => panels.current[i]?.scrollIntoView({ behavior: 'smooth' });

  const finish = (assignmentId: string, index: number) => {
    setDone((prev) => new Set(prev).add(assignmentId));
    // Straight on to the next one, which is the whole point of a feed.
    setTimeout(() => goTo(index + 1), 400);
  };

  const total = watchable.length;

  if (total === 0) {
    return (
      <div className="min-h-svh flex items-center justify-center px-6">
        <p className="text-[15px] text-[#9fb4c2] text-center max-w-[30ch]">
          {t('finished', language)}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      className="h-svh overflow-y-scroll overscroll-none snap-y snap-mandatory bg-black text-white
                 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {watchable.map((item, i) => (
        <Panel
          key={item.assignmentId}
          item={item}
          index={i + 1}
          items={watchable}
          token={token}
          language={language}
          isActive={active === i + 1}
          isNext={active === i}
          sound={sound}
          done={done}
          onRef={(el) => { panels.current[i + 1] = el; }}
          onFinish={() => finish(item.assignmentId, i + 1)}
          onNext={() => goTo(i + 2)}
          onSound={() => setSound(true)}
          header={i === 0
            ? `${patientName.split(' ')[0]} — ${doctorName} ${t('sentYouShort', language)}`
            : null}
        />
      ))}

      {/* End */}
      <section
        data-index={total + 1}
        ref={(el) => { panels.current[total + 1] = el; }}
        className="h-svh snap-start snap-always bg-ink flex flex-col items-center justify-center px-8 text-center"
      >
        <div className="w-12 h-12 rounded-full bg-[#0e6b60] flex items-center justify-center">
          <Check className="w-6 h-6" strokeWidth={2.4} />
        </div>
        <h2 className="text-[24px] font-semibold mt-5">{t('finished', language)}</h2>
        <p className="text-[15px] text-[#9fb4c2] mt-2 max-w-[30ch]">
          {t('askOnWhatsapp', language)}
        </p>
        {askUrl && (
          <a href={askUrl} target="_blank" rel="noreferrer"
             className="mt-6 inline-flex items-center gap-2 rounded-full bg-white text-ink px-6 py-3 text-[15px] font-medium">
            <MessageCircle className="w-4 h-4" strokeWidth={2} />
            {t('askButton', language)}
          </a>
        )}
        <p className="note text-[#5e7382] mt-10 max-w-[34ch]">{t('disclaimer', language)}</p>
      </section>

      {/* Muted is the only way a browser will start on its own. Say so, once,
          and get out of the way the moment they touch the screen. */}
      {!sound && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))]
                        z-20 pointer-events-none flex items-center gap-2 rounded-full
                        bg-black/70 backdrop-blur-sm px-4 py-2.5 text-[13px] font-medium text-white">
          <Volume2 className="w-4 h-4" strokeWidth={2} />
          {t('tapForSound', language)}
        </div>
      )}
    </div>
  );
}
