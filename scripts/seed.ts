/**
 * Seeds Saviora's own content — the pieces every doctor can assign.
 *
 * Owner is NULL, which is what makes them visible to everyone. Re-running
 * updates in place rather than duplicating, so this is safe to run after
 * editing the source file.
 */

import './env';
import { readFileSync } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { content, contentVersions } from '../lib/schema';

type Seed = {
  slug: string; kind: 'video' | 'text'; topic: string;
  estMinutes: number; sortOrder: number;
  versions: { language: string; title: string; summary: string; bodyMd?: string; videoId?: string }[];
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const seeds: Seed[] = JSON.parse(readFileSync('content/nephrology.json', 'utf8'));
  let created = 0;
  let updated = 0;

  try {
    for (const seed of seeds) {
      const [existing] = await db.select().from(content)
        .where(and(eq(content.slug, seed.slug), isNull(content.ownerDoctorId))).limit(1);

      let contentId: string;
      if (existing) {
        await db.update(content).set({
          kind: seed.kind, topic: seed.topic,
          estMinutes: seed.estMinutes, sortOrder: seed.sortOrder,
        }).where(eq(content.id, existing.id));
        contentId = existing.id;
        updated += 1;
      } else {
        const [row] = await db.insert(content).values({
          ownerDoctorId: null,          // Saviora's — every doctor sees it
          slug: seed.slug, kind: seed.kind, topic: seed.topic,
          estMinutes: seed.estMinutes, sortOrder: seed.sortOrder,
        }).returning();
        contentId = row.id;
        created += 1;
      }

      for (const version of seed.versions) {
        const [have] = await db.select().from(contentVersions)
          .where(and(eq(contentVersions.contentId, contentId),
                     eq(contentVersions.language, version.language))).limit(1);
        const values = {
          title: version.title, summary: version.summary,
          bodyMd: version.bodyMd ?? null, videoId: version.videoId ?? null,
        };
        if (have) {
          await db.update(contentVersions).set(values).where(eq(contentVersions.id, have.id));
        } else {
          await db.insert(contentVersions).values({ contentId, language: version.language, ...values });
        }
      }
    }
    console.log(`Saviora content: ${created} created, ${updated} updated`);
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
