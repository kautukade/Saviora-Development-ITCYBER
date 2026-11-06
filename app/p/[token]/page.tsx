import { eq } from 'drizzle-orm';

import { assignedTo } from '@/lib/content';
import { db } from '@/lib/db';
import { patientForToken } from '@/lib/links';
import { doctors } from '@/lib/schema';
import { t } from '@/lib/copy';
import { askUrl } from '@/lib/whatsapp';
import { Reel } from '@/components/Reel';

export const metadata = { robots: { index: false, follow: false } };

export default async function PatientHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await patientForToken(token);

  if (!resolved) {
    return (
      <div className="min-h-svh flex items-center justify-center px-6">
        <div className="max-w-[34ch] text-center">
          <h1 className="text-[21px] font-medium mb-2">{t('linkDeadTitle', 'en')}</h1>
          <p className="text-[15px] text-[#9fb4c2] leading-relaxed">{t('linkDeadBody', 'en')}</p>
        </div>
      </div>
    );
  }

  const { patient } = resolved;
  const lang = patient.language;
  const [doctor] = await db.select().from(doctors).where(eq(doctors.id, patient.doctorId)).limit(1);
  // No language override: each assignment carries the language the doctor
  // chose when he sent it, and forcing the patient's default here would
  // silently undo that choice.
  const items = await assignedTo(patient.id);

  if (items.length === 0) {
    return (
      <div className="min-h-svh flex items-center justify-center px-6">
        <p className="text-[15px] text-[#9fb4c2] text-center max-w-[30ch]">
          {t('finished', lang)}
        </p>
      </div>
    );
  }

  const bare = (doctor?.name ?? '').replace(/^dr\.?\s+/i, '');

  return (
    <Reel
      token={token}
      items={items}
      language={lang}
      doctorName={`${t('drPrefix', lang)} ${bare}`}
      patientName={patient.name}
      askUrl={askUrl(t('askGreeting', lang))}
    />
  );
}
