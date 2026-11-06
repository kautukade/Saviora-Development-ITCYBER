import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { assignedTo } from '@/lib/content';
import { db } from '@/lib/db';
import { patientForToken } from '@/lib/links';
import { t } from '@/lib/copy';
import { AskOnWhatsApp } from '@/components/AskOnWhatsApp';
import { Markdown } from '@/components/Markdown';
import { ReadTracker } from '@/components/ReadTracker';
import { VideoPlayer } from '@/components/VideoPlayer';
import { contentVersions } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';

export const metadata = { robots: { index: false, follow: false } };

export default async function ContentPage({ params }: {
  params: Promise<{ token: string; assignmentId: string }>;
}) {
  const { token, assignmentId } = await params;
  const resolved = await patientForToken(token);
  if (!resolved) notFound();

  const { patient } = resolved;
  const lang = patient.language;

  // Scoped by patient, so one patient's link cannot open another's content.
  const items = await assignedTo(patient.id, lang);
  const item = items.find((i) => i.assignmentId === assignmentId);
  if (!item) notFound();

  const [version] = await db.select().from(contentVersions)
    .where(and(
      eq(contentVersions.contentId, item.contentId),
      eq(contentVersions.language, item.language),
    )).limit(1);

  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-[520px] px-5 py-6">
        <Link href={`/p/${token}`} className="note inline-flex items-center gap-1.5 hover:text-brand">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.8} /> {t('back', lang)}
        </Link>

        <h1 className="text-[21px] font-semibold leading-snug mt-4 mb-5">{item.title}</h1>

        {item.kind === 'video' && item.videoId ? (
          <>
            <VideoPlayer token={token} assignmentId={assignmentId} videoId={item.videoId}
                         language={lang} startPercent={item.percent} />
            {version?.caption && (
              <Markdown source={version.caption} className="mt-7" />
            )}
          </>
        ) : (
          <>
            <ReadTracker token={token} assignmentId={assignmentId} />
            <Markdown source={version?.bodyMd ?? ''} />
          </>
        )}

        <div className="mt-10 pt-5 border-t border-rule">
          <AskOnWhatsApp language={lang} />
          <Link href={`/p/${token}`} className="btn btn-quiet w-full mt-4 py-2.5">
            {t('back', lang)}
          </Link>
        </div>
      </div>
    </div>
  );
}
