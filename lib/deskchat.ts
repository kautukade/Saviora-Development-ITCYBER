/**
 * Keeping the doctor's conversations with the assistant.
 *
 * He asks the same handful of things across a clinic — who is waiting, what did
 * this one's last report show — and the answer to a question he asked on
 * Tuesday is often the answer he wants again on Friday. Keeping them costs
 * almost nothing and saves him retyping.
 *
 * Every function here takes the doctor's id and filters on it. A chat is
 * addressed by an id that arrives from the browser, so ownership is checked on
 * the way in every time rather than trusted — the same rule the rest of the
 * product follows for patients.
 */

import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from './db';
import { deskChats, deskMessages } from './schema';
import type { DeskTurn } from './desk';

/** How much of the first question becomes the name of the chat. */
const TITLE_MAX = 48;

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: Date;
};

/**
 * A name taken from the first thing he asked.
 *
 * Deliberately not a model call. Naming a chat is not worth a second of latency
 * on the one request where he is already waiting, and the first line of a
 * question is a better label than a summary of it anyway.
 */
export function titleFrom(question: string): string {
  const one = question.replace(/\s+/g, ' ').trim();
  if (!one) return 'New chat';
  if (one.length <= TITLE_MAX) return one;
  // Cut at a word so the label does not end mid-word.
  const cut = one.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > 24 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export async function startChat(doctorId: string, question: string) {
  const [chat] = await db.insert(deskChats)
    .values({ doctorId, title: titleFrom(question) })
    .returning();
  return chat;
}

/** Null unless this chat belongs to this doctor. */
export async function chatOwnedBy(doctorId: string, chatId: string) {
  const [chat] = await db.select().from(deskChats)
    .where(and(eq(deskChats.id, chatId), eq(deskChats.doctorId, doctorId)))
    .limit(1);
  return chat ?? null;
}

export async function addTurn(
  chatId: string,
  role: 'user' | 'assistant',
  text: string,
  navigate?: string,
) {
  await db.insert(deskMessages).values({ chatId, role, text, navigate: navigate ?? null });
  // Ordering is by last activity, so returning to an old chat brings it back up.
  await db.update(deskChats).set({ updatedAt: new Date() }).where(eq(deskChats.id, chatId));
}

export async function chatsFor(doctorId: string, limit = 40): Promise<ChatSummary[]> {
  return db.select({ id: deskChats.id, title: deskChats.title, updatedAt: deskChats.updatedAt })
    .from(deskChats)
    .where(eq(deskChats.doctorId, doctorId))
    .orderBy(desc(deskChats.updatedAt))
    .limit(limit);
}

/** The turns of one chat, oldest first, or null if it is not his. */
export async function turnsIn(doctorId: string, chatId: string): Promise<DeskTurn[] | null> {
  if (!(await chatOwnedBy(doctorId, chatId))) return null;

  const rows = await db.select().from(deskMessages)
    .where(eq(deskMessages.chatId, chatId))
    .orderBy(asc(deskMessages.createdAt), asc(deskMessages.id));

  return rows.map((r) => ({ role: r.role as 'user' | 'assistant', text: r.text }));
}

export async function renameChat(doctorId: string, chatId: string, title: string) {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) return { error: 'Give it a name.' };
  if (!(await chatOwnedBy(doctorId, chatId))) return { error: 'That chat is not yours.' };

  await db.update(deskChats).set({ title: clean }).where(eq(deskChats.id, chatId));
  return { title: clean };
}

export async function deleteChat(doctorId: string, chatId: string) {
  if (!(await chatOwnedBy(doctorId, chatId))) return { error: 'That chat is not yours.' };
  // The messages go with it — the foreign key cascades.
  await db.delete(deskChats).where(eq(deskChats.id, chatId));
  return {};
}
