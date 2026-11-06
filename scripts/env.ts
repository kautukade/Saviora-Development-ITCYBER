/**
 * Next.js loads these on its own; plain node scripts do not. They are read here
 * in the same order Next.js uses, so a script and the app never see different
 * values — which matters most for DATABASE_URL, where disagreeing means a
 * script quietly writing to the wrong database.
 *
 * `.env.development.local` comes first and is where the scratch database
 * lives: the Neon integration writes one DATABASE_URL into `.env.local` for
 * every environment, production included.
 */
import { config } from 'dotenv';

config({ path: ['.env.development.local', '.env.local', '.env'], quiet: true });
