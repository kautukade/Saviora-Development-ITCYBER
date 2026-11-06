'use client';

import { useActionState, useEffect, useRef, useTransition } from 'react';
import { Send, Sparkles } from 'lucide-react';

import { draftAction, replyAction, type DraftState, type ReplyState } from '@/app/actions/inbox';

/**
 * The doctor answering in their own words.
 *
 * When a reply cannot be delivered the box is replaced by the reason, not
 * disabled next to it — a send button that silently does nothing is worse than
 * no send button. The WhatsApp handoff stays available either way, because a
 * closed window still has a phone on the other end of it.
 */
export function ReplyBox({ id, canReply, why, chatUrl }: {
  id: string;
  canReply: boolean;
  why: string | null;
  chatUrl: string | null;
}) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyAction, null);
  const [draft, drafting, draftPending] = useActionState<DraftState, FormData>(draftAction, null);
  const [, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  // The draft lands in the box, where it can be changed. It is a starting
  // point, and nothing about it is sent until he presses send himself.
  useEffect(() => {
    if (draft?.text && box.current) {
      box.current.value = draft.text;
      box.current.focus();
    }
  }, [draft]);

  if (state?.sent) {
    return <p className="note text-brand mt-3">Sent, and this is marked answered.</p>;
  }

  if (!canReply) {
    return (
      <div className="mt-3">
        <p className="note text-ink-2 max-w-[62ch]">{why}</p>
        {chatUrl && (
          <a className="tap note inline-flex items-center mt-1.5
                        hover:text-brand active:text-brand underline underline-offset-2"
             href={chatUrl} target="_blank" rel="noreferrer">
            Open WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`reply-${id}`} className="sr-only">Your reply</label>
      <textarea
        ref={box}
        id={`reply-${id}`}
        name="text"
        rows={draft?.text ? 4 : 2}
        placeholder="Answer in your own words…"
        className="w-full bg-surface border border-rule rounded-[3px] px-3 py-2 text-[16px] [@media(pointer:fine)]:text-[14px] leading-relaxed resize-y"
      />
      <div className="flex flex-wrap items-center gap-3 mt-1.5">
        <button className="btn text-[13px] px-3 py-1 inline-flex items-center gap-1.5" disabled={pending}>
          <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
          {pending ? 'Sending…' : 'Send on WhatsApp'}
        </button>

        <button type="button" formAction={undefined} disabled={draftPending}
                onClick={(e) => {
                  e.preventDefault();
                  const data = new FormData();
                  data.set('id', id);
                  // Inside a transition, or isPending never updates and the
                  // button says "Draft a reply" through the whole wait.
                  startTransition(() => drafting(data));
                }}
                className="tap note inline-flex items-center gap-1.5
                           text-ink-3 hover:text-brand active:text-brand transition-colors">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
          {draftPending ? 'Drafting…' : draft?.text ? 'Draft again' : 'Draft a reply'}
        </button>

        {state?.error && <span className="note text-alarm">{state.error}</span>}
        {draft?.error && <span className="note text-alarm">{draft.error}</span>}
      </div>

      {draft?.text && (
        <p className="note text-ink-3 mt-1.5">
          Suggested from your material and their record. Change anything before you send it.
        </p>
      )}
    </form>
  );
}
