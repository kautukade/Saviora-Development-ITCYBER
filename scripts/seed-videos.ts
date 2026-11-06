/**
 * The "What is CKD?" course — Saviora's first real video content.
 *
 *   npx tsx scripts/seed-videos.ts
 *
 * Eight sections, each cut in Hindi and English. The ids and the durations are
 * read off the actual uploads: the two language cuts differ in length, so the
 * duration lives on the version, not the content.
 *
 * Titles are the ones on the uploads. They are honest and they are thin — a
 * patient choosing what to watch learns nothing from "Chapter 3". One line per
 * chapter from Dr Naik would make this materially better content, and every
 * caption below is empty until it arrives.
 */

import './env';
import { and, eq } from 'drizzle-orm';

import { db } from '../lib/db';
import { content, contentVersions } from '../lib/schema';

type Section = {
  slug: string;
  order: number;
  en: { title: string; videoId: string; seconds: number };
  hi: { title: string; videoId: string; seconds: number };
};

const COURSE: Section[] = [
  { slug: 'ckd-course-intro', order: 1,
    en: { title: 'What is CKD? — Introduction', videoId: 'KGnuS69ohMs', seconds: 22 },
    hi: { title: 'CKD क्या है? — परिचय', videoId: 'QHpxFXbzQsc', seconds: 27 } },
  { slug: 'ckd-course-01', order: 2,
    en: { title: 'What is CKD? — Chapter 1', videoId: 'PW0cgGWuddc', seconds: 53 },
    hi: { title: 'CKD क्या है? — अध्याय 1', videoId: 'V1jwojV_gXo', seconds: 75 } },
  { slug: 'ckd-course-02', order: 3,
    en: { title: 'What is CKD? — Chapter 2', videoId: '6EVW9SqWc4k', seconds: 38 },
    hi: { title: 'CKD क्या है? — अध्याय 2', videoId: 'uGwgilrBGd0', seconds: 51 } },
  { slug: 'ckd-course-03', order: 4,
    en: { title: 'What is CKD? — Chapter 3', videoId: 'f8BxV_85oNw', seconds: 39 },
    hi: { title: 'CKD क्या है? — अध्याय 3', videoId: 'n4TJxZ4yAF8', seconds: 50 } },
  { slug: 'ckd-course-04', order: 5,
    en: { title: 'What is CKD? — Chapter 4', videoId: 'WbVkoJewz9w', seconds: 42 },
    hi: { title: 'CKD क्या है? — अध्याय 4', videoId: 'rwAETlV2uTY', seconds: 56 } },
  { slug: 'ckd-course-05', order: 6,
    en: { title: 'What is CKD? — Chapter 5', videoId: 'vmv5611G6ZA', seconds: 53 },
    hi: { title: 'CKD क्या है? — अध्याय 5', videoId: '8SIDbMgsEqY', seconds: 83 } },
  { slug: 'ckd-course-06', order: 7,
    en: { title: 'What is CKD? — Chapter 6', videoId: 'pUSDAm2Z5AU', seconds: 36 },
    hi: { title: 'CKD क्या है? — अध्याय 6', videoId: '4aP6EedV4Hg', seconds: 53 } },
  { slug: 'ckd-course-summary', order: 8,
    en: { title: 'What is CKD? — Summary', videoId: 'uBEMmwNJDog', seconds: 28 },
    hi: { title: 'CKD क्या है? — सारांश', videoId: 'QVUitB4KUQM', seconds: 43 } },
];

async function main() {
  let created = 0, updated = 0;

  for (const s of COURSE) {
    const [existing] = await db.select().from(content).where(eq(content.slug, s.slug)).limit(1);
    const values = {
      slug: s.slug, kind: 'video', topic: 'What is CKD?', condition: 'ckd',
      // Rounded up, and only used where a coarse number is wanted; the version's
      // own durationSeconds is what a patient is shown.
      estMinutes: Math.max(1, Math.round(Math.max(s.en.seconds, s.hi.seconds) / 60)),
      sortOrder: s.order, published: true, ownerDoctorId: null,
    };

    const id = existing
      ? (await db.update(content).set(values).where(eq(content.id, existing.id)).returning())[0].id
      : (await db.insert(content).values(values).returning())[0].id;
    if (existing) updated++; else created++;

    for (const [language, v] of [['en', s.en], ['hi', s.hi]] as const) {
      const row = {
        title: v.title, videoId: v.videoId, durationSeconds: v.seconds,
        summary: null, bodyMd: null, caption: null,
      };
      const [have] = await db.select().from(contentVersions)
        .where(and(eq(contentVersions.contentId, id), eq(contentVersions.language, language)))
        .limit(1);
      if (have) {
        await db.update(contentVersions).set(row).where(eq(contentVersions.id, have.id));
      } else {
        await db.insert(contentVersions).values({ contentId: id, language, ...row });
      }
    }
  }

  // The stand-in that has been sitting in the library since the first build.
  const [placeholder] = await db.select().from(content)
    .where(eq(content.slug, 'what-is-ckd-video')).limit(1);
  if (placeholder) {
    await db.update(content).set({ published: false }).where(eq(content.id, placeholder.id));
    console.log('unpublished the placeholder video');
  }

  console.log(`course: ${created} created, ${updated} updated — 8 sections, both languages`);
  process.exit(0);
}
main();
