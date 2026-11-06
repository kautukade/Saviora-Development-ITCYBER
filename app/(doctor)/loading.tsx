/**
 * What the doctor sees the instant he taps a nav item.
 *
 * Every page here is server-rendered per request, because every one of them
 * reads his patients. Without this file Next has no boundary to show while that
 * happens, so a tap does nothing at all until the server answers — the whole
 * round trip, on clinic wifi, with nothing on screen to say it was heard. That
 * is the "slow top bar": the pages are not slow, the wait is just invisible.
 *
 * Its presence also lets the navigation prefetch, so the common case is that
 * the page is already on its way before the tap lands.
 *
 * Deliberately plain. A shimmering skeleton of fake rows pretends to be content
 * and is read as content; a quiet frame says "coming" and gets out of the way.
 */
export default function Loading() {
  return (
    <div className="p-4 sm:p-6 max-w-[940px]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="h-3 w-16 rounded-full bg-surface-2" />
      <div className="h-6 w-52 rounded-[3px] bg-surface-2 mt-3" />

      <div className="mt-8 flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}
               className="h-16 rounded-[3px] border border-rule bg-surface"
               style={{ opacity: 1 - i * 0.22 }} />
        ))}
      </div>
    </div>
  );
}
