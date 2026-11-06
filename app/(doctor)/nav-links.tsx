'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Inbox, Sparkles, User, Users } from 'lucide-react';

/**
 * The destinations live here rather than in the layout because the icons are
 * React components, and a server component cannot hand those to a client one —
 * they arrive as bare functions and the render fails.
 */
const NAV = [
  { href: '/', icon: Sparkles, label: 'Assistant' },
  { href: '/updates', icon: Inbox, label: 'Updates' },
  { href: '/patients', icon: Users, label: 'Patients' },
  { href: '/library', icon: BookOpen, label: 'Library' },
  { href: '/account', icon: User, label: 'Account' },
];

/**
 * The navigation, with the page you are on marked.
 *
 * A client component only because knowing where you are needs the pathname.
 * It matters most on a phone, where the rail becomes five small buttons along
 * the top and nothing else on the screen says which section you are in.
 */
export function NavLinks({ item, text }: { item: string; text: string }) {
  const path = usePathname();

  return (
    <>
      {NAV.map(({ href, icon: Icon, label }) => {
        // '/' is the assistant and would otherwise prefix-match every page.
        const here = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={here ? 'page' : undefined}
                className={`${item} transition-colors ${
                  here
                    ? 'text-brand bg-brand-wash sm:bg-transparent font-medium'
                    : 'text-ink-2 hover:text-ink hover:bg-ground'}`}>
            <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={here ? 2 : 1.6} />
            <span className={`${text} whitespace-nowrap`}>{label}</span>
          </Link>
        );
      })}
    </>
  );
}
