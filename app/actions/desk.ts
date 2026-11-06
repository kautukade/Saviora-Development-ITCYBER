'use server';

import { revalidatePath } from 'next/cache';

import { requireDoctor } from '@/lib/auth';
import {
  chatsFor, deleteChat, renameChat, turnsIn,
  type ChatSummary,
} from '@/lib/deskchat';
import type { DeskTurn } from '@/lib/desk';

/**
 * The assistant itself is not here. Asking it streams, and a server action
 * returns once at the end — see app/api/desk/route.ts. What is left is the
 * housekeeping around the conversations: listing, reopening, renaming, removing.
 */

export async function listChats(): Promise<ChatSummary[]> {
  const doctor = await requireDoctor();
  return chatsFor(doctor.id);
}

export async function openChat(chatId: string): Promise<DeskTurn[]> {
  const doctor = await requireDoctor();
  return (await turnsIn(doctor.id, chatId)) ?? [];
}

export async function renameChatAction(chatId: string, title: string) {
  const doctor = await requireDoctor();
  const result = await renameChat(doctor.id, chatId, title);
  revalidatePath('/');
  return result;
}

export async function deleteChatAction(chatId: string) {
  const doctor = await requireDoctor();
  const result = await deleteChat(doctor.id, chatId);
  revalidatePath('/');
  return result;
}
