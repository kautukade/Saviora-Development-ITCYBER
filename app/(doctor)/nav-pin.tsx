'use client';

import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { toggleNav } from '@/app/actions/ui';

/**
 * Pin the sidebar open, or let it collapse back to a rail.
 *
 * It sits at the top, beside the wordmark, where the thing it controls begins.
 *
 * The current path goes with the request so the action can revalidate this
 * layout and nothing else — a cookie write does not re-render on its own, and
 * revalidating the whole app to move a sidebar is not a fair trade.
 */
export function NavPin({ pinned }: { pinned: boolean }) {
  const pathname = usePathname();
  const Icon = pinned ? PanelLeftClose : PanelLeftOpen;

  return (
    <form action={toggleNav} className="hidden sm:block shrink-0">
      <input type="hidden" name="pathname" value={pathname} />
      <button
        className={`flex items-center justify-center w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-[3px]
                    text-ink-3 hover:text-ink hover:bg-ground transition-colors ${
                      pinned ? 'mr-3' : 'mx-auto'}`}
        aria-pressed={pinned}
        aria-label={pinned ? 'Collapse the sidebar' : 'Keep the sidebar open'}
        title={pinned ? 'Collapse the sidebar' : 'Keep the sidebar open'}
      >
        <Icon className="w-[18px] h-[18px]" strokeWidth={1.6} />
      </button>
    </form>
  );
}
