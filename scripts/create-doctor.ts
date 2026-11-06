/**
 * Creates a doctor account, or resets an existing one's password.
 *
 *   npx tsx scripts/create-doctor.ts "sachinnaik3@gmail.com" "Sachin Naik" "Nephrology"
 *
 * Prints a generated password once. Nobody should be typing passwords into a
 * terminal where they end up in shell history.
 *
 * DEMO_PASSWORD overrides that for shared demo accounts, which need a password
 * several people can be told. It is an environment variable rather than an
 * argument so it does not land in shell history, and it should never be used
 * for a real doctor's account.
 */

import './env';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hash } from 'bcryptjs';

import { doctors } from '../lib/schema';

function generatePassword() {
  // Base64url, no ambiguous characters to read aloud over a phone.
  return randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
}

async function main() {
  const [email, name, specialty, clinicName] = process.argv.slice(2);
  if (!email || !name) {
    console.error('usage: create-doctor.ts <email> <name> [specialty] [clinic]');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    const password = process.env.DEMO_PASSWORD || generatePassword();
    const passwordHash = await hash(password, 12);
    const lower = email.trim().toLowerCase();

    const [existing] = await db.select().from(doctors).where(eq(doctors.email, lower)).limit(1);
    if (existing) {
      await db.update(doctors).set({ passwordHash, name, specialty, clinicName })
        .where(eq(doctors.id, existing.id));
      console.log(`\nReset the password for ${lower}`);
    } else {
      await db.insert(doctors).values({ email: lower, passwordHash, name, specialty, clinicName });
      console.log(`\nCreated ${lower}`);
    }

    console.log(`\n  email     ${lower}`);
    console.log(`  password  ${password}`);
    console.log(process.env.DEMO_PASSWORD
      ? '\nShared demo password. Not for a real doctor\'s account.\n'
      : '\nShown once. Pass it on directly and have them change it after signing in.\n');
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
