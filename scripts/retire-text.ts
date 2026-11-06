/**
 * Take Saviora's written pieces off the shelf.
 *
 *   npx tsx scripts/retire-text.ts
 *
 * The ten nephrology write-ups were mine, standing in until real content
 * existed. The video course is the real content, so they are unpublished
 * rather than deleted: anything already sent to a patient keeps working, and
 * they remain a source for the assistant to answer from.
 *
 * A doctor's own written material is untouched — this only retires Saviora's.
 */

import './env';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../lib/db';
import { content } from '../lib/schema';

async function main() {
  const retired = await db.update(content)
    .set({ published: false })
    .where(and(eq(content.kind, 'text'), isNull(content.ownerDoctorId), eq(content.published, true)))
    .returning({ slug: content.slug });

  for (const r of retired) console.log('  retired', r.slug);
  console.log(`${retired.length} written pieces off the shelf; the video course remains`);
  process.exit(0);
}
main();
