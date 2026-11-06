'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowUp, Check, Clock, Inbox, Mic, Pencil, Plus,
  Send as SendIcon, Square, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import Link from 'next/link';

import { deleteChatAction, listChats, openChat, renameChatAction } from '@/app/actions/desk';
import type { ChatSummary } from '@/lib/deskchat';
import { Markdown } from '@/components/Markdown';

/**
 * The home screen: one question box and almost nothing else.
 *
 * A dashboard of panels asks a doctor to read before he can act. This asks him
 * to say what he wants. The three quick actions are the three things he does
 * most, phrased as he would say them, and they double as documentation of what
 * the thing can be asked.
 *
 * Nothing here scrolls the page. An answer that runs long scrolls inside its
 * own box, so the box, the field and the actions never move.
 */

/**
 * Two different things, kept apart on purpose.
 *
 * Tasks are what he came to do. They are links, so they happen at once — asking
 * a model to route "add a patient" is a wait for something already known.
 *
 * Asks are questions worth asking, and each maps to something the assistant can
 * genuinely answer. A suggestion the tools cannot serve teaches him the thing
 * is useless. "Show me a patient" was not a question at all.
 */
const TASKS = [
  { href: '/send', icon: SendIcon, label: 'Send a module' },
  { href: '/patients?add=1', icon: UserPlus, label: 'Add a patient' },
  { href: '/updates', icon: Inbox, label: 'Answer questions' },
  { href: '/patients', icon: Users, label: 'Find a patient' },
];

const ASKS = [
  'Which patients have a critical result I have not answered?',
  'Who has not opened anything I sent them?',
  'Summarise John Doe before I see him',
];

/** Chrome and Safari expose it under a prefix; Firefox not at all. */
type Recognition = {
  start(): void; stop(): void;
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/** The field, the mic and the send button — identical in both states. */
function Composer({ form, field, onSubmit, pending, voiceable, listening, dictate }: {
  form: React.RefObject<HTMLFormElement | null>;
  field: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  pending: boolean;
  voiceable: boolean;
  listening: boolean;
  dictate: () => void;
}) {
  return (
    <form ref={form} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="flex items-center gap-2 bg-surface border border-rule rounded-full pl-5 pr-2 py-1.5
                      focus-within:border-brand transition-colors">
        <input
          ref={field}
          name="question"
          autoComplete="off"
          placeholder="Ask anything"
          className="flex-1 min-w-0 bg-transparent py-2 text-[16px] [@media(pointer:fine)]:text-[15px] outline-none"
        />
        {voiceable && (
          <button type="button" onClick={dictate} aria-label={listening ? 'Stop listening' : 'Speak'}
                  className={`shrink-0 w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11
                              rounded-full flex items-center justify-center transition-colors ${
                    listening ? 'bg-alarm text-white' : 'text-ink-3 hover:text-ink hover:bg-ground'}`}>
            {listening ? <Square className="w-4 h-4" fill="currentColor" /> : <Mic className="w-[18px] h-[18px]" strokeWidth={1.8} />}
          </button>
        )}
        <button aria-label="Ask" disabled={pending}
                className="shrink-0 w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11
                           rounded-full bg-brand text-white flex items-center justify-center
                           disabled:opacity-40 transition-opacity">
          <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </button>
      </div>
    </form>
  );
}

export type Mark = { href: string; icon: 'inbox' | 'urgent' | 'patients'; n: number; label: string };

type Turn = { role: 'user' | 'assistant'; text: string };

/**
 * What it is doing, while it does it.
 *
 * Naming the step is not decoration. "Reading the record" tells him it
 * understood which patient he meant, early enough to stop and rephrase if it
 * did not — and a line that changes is the difference between waiting and
 * wondering whether the thing is broken.
 */
function Working({ label }: { label: string }) {
  return (
    <p className="note text-ink-3 inline-flex items-center gap-2" aria-live="polite">
      <span className="w-3 h-3 rounded-full border-[1.5px] border-rule border-t-brand animate-spin shrink-0" />
      {label}…
    </p>
  );
}

const MARK_ICON = { inbox: Inbox, urgent: AlertTriangle, patients: Users };


/** "2h", "yesterday", "14 Aug" — enough to find a conversation again. */
function when(at: Date): string {
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h`;
  if (mins < 48 * 60) return 'yesterday';
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Everything he has asked before.
 *
 * A panel rather than a permanent column: the home screen has to fit a phone
 * without scrolling, and a list of old conversations is not what he came for.
 * It is one tap away and out of the way otherwise.
 */
function History({ chats, currentId, onOpen, onClose, onChanged }: {
  chats: ChatSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const save = async (id: string) => {
    const title = draft.trim();
    setEditing(null);
    if (title) { await renameChatAction(id, title); onChanged(); }
  };

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-label="Previous chats">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />

      <div className="relative bg-surface border-r border-rule w-full sm:w-[320px] h-full
                      flex flex-col shadow-xl">
        <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-rule">
          <span className="label">Previous chats</span>
          <button onClick={onClose} aria-label="Close"
                  className="tap tap-pad text-ink-3 hover:text-ink active:text-ink">
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {chats.length === 0 && (
            <p className="note text-ink-3 px-4 py-5">
              Nothing yet. What you ask here is kept, so you can come back to it.
            </p>
          )}

          <ul className="divide-y divide-rule-soft">
            {chats.map((c) => (
              <li key={c.id} className={c.id === currentId ? 'bg-brand-wash/50' : ''}>
                {editing === c.id ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') void save(c.id);
                             if (e.key === 'Escape') setEditing(null);
                           }}
                           className="flex-1 min-w-0 bg-ground border border-rule rounded-[3px] px-2 py-1.5
                                      text-[16px] [@media(pointer:fine)]:text-[13.5px] outline-none" />
                    <button onClick={() => void save(c.id)} aria-label="Save name"
                            className="tap tap-pad text-brand">
                      <Check className="w-4 h-4" strokeWidth={2.2} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 pr-2">
                    <button onClick={() => { onOpen(c.id); onClose(); }}
                            className="flex-1 min-w-0 text-left px-4 py-3">
                      <span className="block truncate text-[14px]">{c.title}</span>
                      <span className="note text-ink-3 inline-flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" strokeWidth={1.8} /> {when(c.updatedAt)}
                      </span>
                    </button>
                    <button onClick={() => { setEditing(c.id); setDraft(c.title); }}
                            aria-label={`Rename ${c.title}`}
                            className="tap tap-pad shrink-0 text-ink-3 hover:text-brand active:text-brand">
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button onClick={async () => { await deleteChatAction(c.id); onChanged(); }}
                            aria-label={`Delete ${c.title}`}
                            className="tap tap-pad shrink-0 text-ink-3 hover:text-alarm active:text-alarm">
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Desk({ greeting, marks }: { greeting: string; marks: Mark[] }) {
  const [session, setSession] = useState(0);
  return (
    <DeskSession
      key={session}
      greeting={greeting}
      marks={marks}
      onNew={() => setSession((n) => n + 1)}
    />
  );
}

function DeskSession({ greeting, marks, onNew }: {
  greeting: string; marks: Mark[]; onNew: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const pending = status !== null;

  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const answers = useRef<HTMLDivElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Loaded once, in the background: the greeting must not wait on a list the
  // doctor has not asked for.
  const refreshChats = useCallback(() => { void listChats().then(setChats); }, []);
  useEffect(refreshChats, [refreshChats]);

  const resume = async (id: string) => {
    const past = await openChat(id);
    setChatId(id);
    setTurns(past);
    setError(null);
  };

  /**
   * Asking, as a stream.
   *
   * The assistant may make four model calls before it knows the answer. Waiting
   * for all of them and then painting the result is several seconds of a blank
   * screen, which reads as broken. Instead the status line says what it is
   * doing, and the answer arrives a few words at a time.
   */
  const send = useCallback(async (question: string) => {
    setError(null);
    setTurns((t) => [...t, { role: 'user', text: question }, { role: 'assistant', text: '' }]);
    setStatus('Thinking');

    let navigate: string | undefined;
    try {
      const res = await fetch('/api/desk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, chatId }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Server-sent events arrive as blank-line-separated blocks, and a
        // single read can hold part of one — so anything after the last blank
        // line is kept for the next pass.
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === 'chat') setChatId(event.chatId);
          else if (event.type === 'status') setStatus(event.text);
          else if (event.type === 'delta') {
            setStatus(null);
            setTurns((t) => {
              const next = [...t];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, text: last.text + event.text };
              return next;
            });
          } else if (event.type === 'done') {
            navigate = event.navigate;
            if (event.text) {
              setTurns((t) => {
                const next = [...t];
                next[next.length - 1] = { role: 'assistant', text: event.text };
                return next;
              });
            }
          } else if (event.type === 'error') {
            setError(event.text);
            setTurns((t) => t.slice(0, -1));
          }
        }
      }
    } catch {
      setError('That did not go through. Try again.');
      setTurns((t) => t.slice(0, -1));
    } finally {
      setStatus(null);
    }

    refreshChats();

    // When it knows where he wants to be, go — the sentence is not the point.
    if (navigate) router.push(navigate);
  }, [chatId, router, refreshChats]);

  // Whether this browser can hear is a fact about the browser, not state we
  // own. The server snapshot is false, so nothing renders a mic that will not
  // work and nothing flashes one in and out on hydration.
  const voiceable = useSyncExternalStore(
    () => () => {},
    () => {
      const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    },
    () => false,
  );

  useEffect(() => {
    if (!pending) field.current?.focus();
    answers.current?.scrollTo({ top: answers.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);

  const submit = () => {
    const question = field.current?.value.trim();
    if (!question || pending) return;
    if (field.current) field.current.value = '';
    void send(question);
  };

  const ask = (question: string) => {
    if (pending) return;
    if (field.current) field.current.value = '';
    void send(question);
  };

  const dictate = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    if (listening) { recognition.current?.stop(); return; }

    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const said = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>)
        .map((res) => res[0].transcript).join('');
      if (field.current) field.current.value = said;
    };
    r.onend = () => {
      setListening(false);
      // Send what was heard, rather than making him press a second button.
      if (field.current?.value.trim()) submit();
    };
    r.onerror = () => setListening(false);

    recognition.current = r;
    setListening(true);
    r.start();
  };

  const asked = turns.length > 0;

  if (asked) {
    return (
      <div className="h-full flex flex-col">
        <header className="shrink-0 flex items-center justify-between gap-3 px-5 py-3">
          <button onClick={onNew}
                  className="tap note inline-flex items-center gap-1.5 text-ink-3 hover:text-brand
                             active:text-brand transition-colors">
            <Plus className="w-3.5 h-3.5" strokeWidth={2} /> New
          </button>
          <button onClick={() => setShowHistory(true)}
                  className="tap note inline-flex items-center gap-1.5 text-ink-3 hover:text-brand
                             active:text-brand transition-colors">
            <Clock className="w-3.5 h-3.5" strokeWidth={1.8} /> Recent
          </button>
        </header>

        <div ref={answers} className="flex-1 overflow-y-auto px-5">
          <div className="max-w-[680px] mx-auto flex flex-col gap-6 py-2 pb-6">
            {turns.map((t, i) => (
              t.role === 'user' ? (
                <p key={i} className="self-end max-w-[80%] bg-surface border border-rule
                                      rounded-[14px] rounded-br-[4px] px-4 py-2.5 text-[15px]">
                  {t.text}
                </p>
              ) : (
                <div key={i} className="text-[15.5px] leading-relaxed">
                  <Markdown source={t.text} />
                </div>
              )
            ))}
            {status && <Working label={status} />}
          </div>
        </div>

        <div className="shrink-0 px-5 pb-5 pt-2">
          <div className="max-w-[680px] mx-auto">
            <Composer
              form={form} field={field} onSubmit={submit} pending={pending}
              voiceable={voiceable} listening={listening} dictate={dictate}
            />
            {error && <p className="note text-alarm mt-2">{error}</p>}
          </div>
        </div>

      {showHistory && (
        <History chats={chats} currentId={chatId}
                 onOpen={(id) => void resume(id)}
                 onClose={() => setShowHistory(false)}
                 onChanged={refreshChats} />
      )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center px-5 py-6 overflow-y-auto relative">
      {/* Small, in the corner, and silent unless there is something. He looks
          when he wants to, rather than being handed a list on arrival. */}
      {chats.length > 0 && (
        <button onClick={() => setShowHistory(true)}
                className="tap absolute top-4 left-5 note inline-flex items-center gap-1.5
                           text-ink-3 hover:text-brand active:text-brand transition-colors">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.8} /> Recent
        </button>
      )}

      <div className="absolute top-4 right-5 flex items-center gap-1">
        {marks.map(({ href, icon, n, label }) => {
          const Icon = MARK_ICON[icon];
          return (
            <Link key={label} href={href} title={`${n} ${label}`}
                  className={`tap flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-surface
                              transition-colors ${icon === 'urgent' ? 'text-alarm' : 'text-ink-3 hover:text-ink'}`}>
              <Icon className="w-4 h-4" strokeWidth={1.8} />
              <span className="font-mono text-[12px] tabular-nums">{n}</span>
            </Link>
          );
        })}
      </div>

      <div className="w-full max-w-[560px]">
        {!asked && (
          <>
            <div className="text-center mb-6">
              <h1 className="font-display text-[30px] leading-tight">{greeting}</h1>
              <p className="text-[15px] text-ink-2 mt-1.5">What can I do for you?</p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {TASKS.map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href}
                      className="tap inline-flex items-center gap-2 rounded-full border border-rule bg-surface
                                 px-4 py-2 text-[13.5px] hover:border-brand hover:text-brand
                                 active:border-brand active:text-brand transition-colors">
                  <Icon className="w-4 h-4" strokeWidth={1.8} />
                  {label}
                </Link>
              ))}
            </div>
          </>
        )}

        {asked && (
          <div ref={answers} className="max-h-[46svh] overflow-y-auto overscroll-contain mb-5 flex flex-col gap-3.5 pr-1">
            {turns.map((t, i) => (
              t.role === 'user' ? (
                <p key={i} className="text-[14px] text-ink-3">{t.text}</p>
              ) : (
                <div key={i} className="text-[15.5px] leading-relaxed">
                  <Markdown source={t.text} />
                </div>
              )
            ))}
            {status && <Working label={status} />}
          </div>
        )}

        <Composer
          form={form} field={field} onSubmit={submit} pending={pending}
          voiceable={voiceable} listening={listening} dictate={dictate}
        />

        {!asked && (
          <div className="flex flex-col items-center gap-1.5 mt-4">
            {ASKS.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} disabled={pending}
                      className="tap text-[13.5px] text-ink-3 hover:text-brand active:text-brand
                                 transition-colors text-center">
                {q}
              </button>
            ))}
          </div>
        )}

        {error && <p className="note text-alarm text-center mt-3">{error}</p>}
      </div>

      {showHistory && (
        <History chats={chats} currentId={chatId}
                 onOpen={(id) => void resume(id)}
                 onClose={() => setShowHistory(false)}
                 onChanged={refreshChats} />
      )}
    </div>
  );
}
