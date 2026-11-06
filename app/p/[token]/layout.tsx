import type { Viewport } from 'next';

/**
 * The patient half of the product, which is only ever opened on a phone —
 * usually from inside WhatsApp's own browser.
 *
 * Three things have to be said here and nowhere else. The reel is near-black
 * and the doctor's app is near-white, so the browser is told which one it is
 * framing, or an iPhone paints white bars above and below a dark video feed.
 * viewportFit lets the page reach under the notch and the home indicator, and
 * the padding below keeps anything tappable clear of them. And the ground is
 * set here rather than on <body> so the doctor's screens are left alone.
 */
export const viewport: Viewport = {
  themeColor: '#0c1f2e',
  viewportFit: 'cover',
  // Pinch-zoom stays available. Locking it out is the usual reflex on a feed
  // and it is the wrong one for patients who may need to enlarge the text.
  initialScale: 1,
};

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink text-[#eef1f4] min-h-svh [padding-bottom:env(safe-area-inset-bottom)]">
      {children}
    </div>
  );
}
