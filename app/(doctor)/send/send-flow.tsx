'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Check, MessageCircle, Play, Search } from 'lucide-react';

import { sendAction, type SendState } from '@/app/actions/send';
import { howLong } from '@/lib/copy';

type Module = {
  id: string; title: string; kind: 'video' | 'text';
  estMinutes: number; durationSeconds: number | null; fromSaviora: boolean;
};
type Patient = { id: string; name: string; mrn: string | null; language: string; phone: string | null };

/**
 * Module first, then who, then which language.
 *
 * The order is the order a doctor thinks in at the end of a consultation: he
 * has decided what this person needs to understand before he has thought about
 * their phone. Everything is on one screen because three steps across three
 * screens is three loads on a clinic connection.
 */
export function SendFlow({ modules, patients, preselectedModule, preselectedPatient }: {
  modules: Module[];
  patients: Patient[];
  preselectedModule?: string;
  preselectedPatient?: string;
}) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendAction, {});

  const [chosen, setChosen] = useState<string[]>(preselectedModule ? [preselectedModule] : []);
  const [who, setWho] = useState<string>(preselectedPatient ?? '');
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<string | null>(null);

  const patient = patients.find((p) => p.id === who) ?? null;
  // Their own language unless he says otherwise — the common case needs no click.
  const sending = language ?? patient?.language ?? 'hi';

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 6);
    return patients.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.mrn ?? '').toLowerCase().includes(q),
    ).slice(0, 8);
  }, [patients, query]);

  if (state.sent) {
    const { count, patient: name, url, whatsapp } = state.sent;
    return (
      <div className="p-4 sm:p-6 max-w-[560px]">
        <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center mb-4">
          <Check className="w-5 h-5" strokeWidth={2.4} />
        </div>
        <h1 className="text-[24px] font-semibold leading-tight">
          {count > 0 ? `On ${name}'s list` : `${name} already had all of that`}
        </h1>
        <p className="note mt-2 max-w-[52ch]">
          {count > 0
            ? `${count} added. Send them the link and they can watch it.`
            : 'Nothing new was added. Their link still works.'}
        </p>

        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-primary mt-5 inline-flex">
            <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
            Send on WhatsApp
          </a>
        ) : (
          <p className="note text-attend mt-5">
            No number on file — copy the link and send it yourself.
          </p>
        )}

        <p className="note text-ink-3 mt-4 font-mono break-all">{url}</p>

        <div className="flex gap-3 mt-6">
          <Link href="/send" className="btn btn-quiet">Send something else</Link>
          <Link href="/" className="btn btn-quiet">Done</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="p-4 sm:p-6 max-w-[900px]">
      <div className="label mb-1">Send</div>
      <h1 className="text-[24px] font-semibold leading-tight mb-6">What are you sending?</h1>

      <input type="hidden" name="patientId" value={who} />
      <input type="hidden" name="language" value={sending} />
      {chosen.map((id) => <input key={id} type="hidden" name="contentId" value={id} />)}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section>
          <h2 className="label mb-2">
            What <span className="font-mono text-ink-3 ml-1">{chosen.length || ''}</span>
          </h2>
          <ul className="sheet divide-y divide-rule-soft lg:max-h-[46dvh] lg:overflow-y-auto">
            {modules.map((m) => {
              const on = chosen.includes(m.id);
              return (
                <li key={m.id}>
                  <button type="button"
                          onClick={() => setChosen((c) => on ? c.filter((x) => x !== m.id) : [...c, m.id])}
                          className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-ground transition-colors ${
                            on ? 'bg-brand-wash/50' : ''}`}>
                    <span className={`mt-0.5 w-4 h-4 rounded-[3px] border shrink-0 flex items-center justify-center ${
                      on ? 'bg-brand border-brand text-white' : 'border-rule'}`}>
                      {on && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
                        {m.kind === 'video'
                          ? <Play className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={2} />
                          : <BookOpen className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={1.8} />}
                        {m.title}
                      </span>
                      <span className="label block mt-0.5">
                        {howLong(m.durationSeconds, m.estMinutes)} · {m.fromSaviora ? 'Saviora' : 'yours'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="label mb-2">Who</h2>
          <div className="flex items-center gap-2 bg-surface border border-rule rounded-[3px] px-3 mb-2">
            <Search className="w-4 h-4 text-ink-3 shrink-0" strokeWidth={1.8} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Search by name or hospital number"
                   className="flex-1 min-w-0 bg-transparent py-2 text-[16px] [@media(pointer:fine)]:text-[14px] outline-none" />
          </div>

          <ul className="sheet divide-y divide-rule-soft max-h-[45svh] lg:max-h-[30dvh]
                         overflow-y-auto overscroll-contain">
            {found.length === 0 && (
              <li className="px-4 py-3 note">No patient matches that.</li>
            )}
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { setWho(p.id); setLanguage(null); }}
                        className={`w-full text-left px-4 py-2.5 hover:bg-ground transition-colors ${
                          who === p.id ? 'bg-brand-wash/50' : ''}`}>
                  <span className="text-[14px] font-medium">{p.name}</span>
                  <span className="label block mt-0.5">
                    {[p.mrn, `reads ${p.language.toUpperCase()}`, p.phone ?? 'no number']
                      .filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <h2 className="label mt-5 mb-2">In which language</h2>
          <div className="flex gap-2">
            {(['hi', 'en'] as const).map((code) => (
              <button key={code} type="button" onClick={() => setLanguage(code)}
                      className={`btn ${sending === code ? 'btn-primary' : 'btn-quiet'}`}>
                {code === 'hi' ? 'हिंदी' : 'English'}
                {patient?.language === code && (
                  <span className={sending === code ? 'opacity-80' : 'text-ink-3'}> · theirs</span>
                )}
              </button>
            ))}
          </div>

          {/* Stacked on a phone this sat below both lists, off the bottom of a
              long page. It rides the bottom of the screen instead, and says
              what is still missing rather than just being disabled. */}
          <div className="sticky bottom-0 z-10 mt-6 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0
                          pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:py-0
                          bg-ground/95 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none
                          border-t border-rule lg:border-0">
            <button className="btn btn-primary w-full py-2.5"
                    disabled={pending || !chosen.length || !who}>
              {pending ? 'Sending…'
                : !chosen.length ? 'Choose what to send'
                : !who ? 'Choose who it is for'
                : `Send ${chosen.length} to ${patient?.name.split(' ')[0]}`}
            </button>
            {state.error && <p className="note text-alarm mt-2">{state.error}</p>}
          </div>
        </section>
      </div>
    </form>
  );
}
