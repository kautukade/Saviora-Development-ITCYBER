'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/**
 * Whether the sidebar stays open.
 *
 * Kept in a cookie rather than localStorage because the layout is a Server
 * Component: the server has to know the width before it renders, or the rail
 * paints narrow and jumps wide once the client hydrates on every page load.
 *
 * A year, because pinning a sidebar is a preference, not a session.
 */
const COOKIE = 'saviora_nav';

export type NavState = 'pinned' | 'collapsed';

/** Open unless they have said otherwise — no cookie means pinned. */
export async function navState(): Promise<NavState> {
  return (await cookies()).get(COOKIE)?.value === 'collapsed' ? 'collapsed' : 'pinned';
}

export async function toggleNav(formData: FormData) {
  const store = await cookies();
  const current: NavState = store.get(COOKIE)?.value === 'collapsed' ? 'collapsed' : 'pinned';
  const next: NavState = current === 'pinned' ? 'collapsed' : 'pinned';
  store.set(COOKIE, next, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  // A cookie write does not re-render anything by itself. Revalidate this
  // layout only — moving a sidebar should not invalidate the whole app.
  const pathname = String(formData.get('pathname') ?? '/');
  revalidatePath(pathname, 'layout');
}
