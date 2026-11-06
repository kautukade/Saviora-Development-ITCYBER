/**
 * One driver everywhere.
 *
 * postgres.js talks to a local Postgres and to Neon alike, so development and
 * production cannot drift apart on connection behaviour — which is the usual
 * source of "works on my machine, fails on Vercel".
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Serverless invocations are short-lived and many, so a small pool per instance
// with prepared statements off is the right shape against a pooled endpoint.
const client = postgres(url, { max: 1, prepare: false });

export const db = drizzle(client, { schema });
export { schema };
