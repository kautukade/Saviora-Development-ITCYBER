/**
 * Applies pending migrations.
 *
 * Run through the ORM's own migrator rather than the drizzle-kit CLI: it is the
 * same code path in development, in CI and on a deploy, and it reports the error
 * when something fails instead of exiting silently.
 */

import './env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    console.log('migrations applied');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('migration failed:', error);
  process.exit(1);
});
