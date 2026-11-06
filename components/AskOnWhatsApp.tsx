import { MessageCircle } from 'lucide-react';

import { t } from '@/lib/copy';
import { askUrl } from '@/lib/whatsapp';

/**
 * How the patient starts the conversation.
 *
 * Deliberately the patient's move, not ours: their message opens Meta's
 * 24-hour window, inside which the bot can answer in ordinary text. Reaching
 * them first would need an approved message template for every kind of thing
 * we might say.
 *
 * With no number configured this falls back to the sentence alone, rather than
 * a button that goes nowhere.
 */
export function AskOnWhatsApp({ language }: { language: string }) {
  const url = askUrl(t('askGreeting', language));

  if (!url) return <p className="note">{t('askOnWhatsapp', language)}</p>;

  return (
    <div>
      <p className="note mb-2.5">{t('askOnWhatsapp', language)}</p>
      <a href={url} target="_blank" rel="noreferrer" className="btn inline-flex">
        <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
        {t('askButton', language)}
      </a>
    </div>
  );
}
