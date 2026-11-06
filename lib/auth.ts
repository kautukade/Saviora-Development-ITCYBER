/**
 * Doctor sign-in.
 *
 * Deliberately small: there is no sign-up page, because an open registration
 * form on a health platform collects junk accounts and serves nobody when there
 * is one doctor. Accounts are created by `scripts/create-doctor.ts`.
 *
 * The session is a signed JWT in an httpOnly cookie. There is no password
 * reset — the doctor can change their password from inside the app, and
 * *forgotten* passwords mean running the script again. That is fine for one
 * doctor and untenable past a handful; the moment a second clinic appears this
 * needs an email provider.
 */

import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { db } from './db';
import { doctors } from './schema';

const COOKIE = 'saviora_session';
// Thirty days, not twelve hours. It never slides — a Server Component cannot
// set a cookie, so refreshing on use needs middleware this app does not have —
// so twelve hours meant expiring mid-clinic and retyping a sixteen-character
// generated password on a phone, with no email reset to fall back on. The
// trade is a longer-lived session on a device that could be lost; sign out
// exists, and the risk of a doctor who cannot get in is the larger one here.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(value);
}

export const hashPassword = (plain: string) => hash(plain, 12);
export const verifyPassword = (plain: string, hashed: string) => compare(plain, hashed);

export type Doctor = typeof doctors.$inferSelect;

export async function signIn(email: string, password: string): Promise<Doctor | null> {
  const [doctor] = await db.select().from(doctors)
    .where(eq(doctors.email, email.trim().toLowerCase())).limit(1);

  // Compare even when no account matched, so a wrong email and a wrong password
  // take the same time and the form cannot be used to enumerate accounts.
  const stored = doctor?.passwordHash
    ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const ok = await verifyPassword(password, stored);
  if (!doctor || !ok || !doctor.isActive) return null;

  const token = await new SignJWT({ sub: doctor.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return doctor;
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in doctor, or null. Safe to call anywhere on the server. */
export async function currentDoctor(): Promise<Doctor | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub;
    if (typeof id !== 'string') return null;
    const [doctor] = await db.select().from(doctors).where(eq(doctors.id, id)).limit(1);
    return doctor?.isActive ? doctor : null;
  } catch {
    return null;
  }
}

/** For pages that must not render without a doctor. */
export async function requireDoctor(): Promise<Doctor> {
  const doctor = await currentDoctor();
  // redirect() throws, so nothing after this runs — but TypeScript only knows
  // that from the static import.
  if (!doctor) redirect('/login');
  return doctor;
}

export async function changePassword(doctorId: string, current: string, next: string) {
  const [doctor] = await db.select().from(doctors).where(eq(doctors.id, doctorId)).limit(1);
  if (!doctor) return { ok: false as const, error: 'Account not found.' };
  if (!(await verifyPassword(current, doctor.passwordHash))) {
    return { ok: false as const, error: 'That is not your current password.' };
  }
  if (next.length < 10) {
    return { ok: false as const, error: 'Use at least 10 characters.' };
  }
  await db.update(doctors)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(doctors.id, doctorId));
  return { ok: true as const };
}
