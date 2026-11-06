/**
 * The rules about a patient's identity that more than one caller needs.
 *
 * A WhatsApp number is the only thing the bot has to go on, so two patients
 * sharing one is not a cosmetic problem: it decides whose material an answer
 * comes from and whose record a blood result is written to.
 */

import { eq } from 'drizzle-orm';

import { db } from './db';
import { patients } from './schema';

/** Every patient registered with this number, across every doctor. */
export const withPhone = (phone: string) =>
  db.select({ id: patients.id, name: patients.name })
    .from(patients).where(eq(patients.phone, phone));

/**
 * Who already holds this number — for the form to refuse it.
 *
 * Whose patient they are decides what may be said. Naming another clinic's
 * patient to this doctor would leak a name and a phone number that are not
 * his; "someone else's patient" is all he needs to pick a different number.
 */
export async function phoneClash(
  phone: string, doctorId: string,
): Promise<{ mine: true; name: string } | { mine: false } | null> {
  if (!phone) return null;
  const [clash] = await db.select({ name: patients.name, doctorId: patients.doctorId })
    .from(patients).where(eq(patients.phone, phone)).limit(1);
  if (!clash) return null;
  return clash.doctorId === doctorId ? { mine: true, name: clash.name } : { mine: false };
}
