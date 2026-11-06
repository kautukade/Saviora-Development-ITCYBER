'use server';

/**
 * Server Actions are reachable by direct POST, not only through our own forms,
 * so each one checks what it needs rather than trusting the caller.
 */

import { redirect } from 'next/navigation';

import { changePassword, currentDoctor, signIn, signOut } from '@/lib/auth';

export type SignInState = { error?: string };

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Enter your email and password.' };

  const doctor = await signIn(email, password);
  // One message for a wrong email and a wrong password alike — otherwise the
  // form tells anyone who asks which addresses have accounts.
  if (!doctor) return { error: 'That email and password do not match an account.' };

  redirect('/');
}

export async function signOutAction() {
  await signOut();
  redirect('/login');
}

export type PasswordState = { error?: string; done?: boolean };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const doctor = await currentDoctor();
  if (!doctor) return { error: 'Sign in again.' };

  const result = await changePassword(
    doctor.id,
    String(formData.get('current') ?? ''),
    String(formData.get('next') ?? ''),
  );
  return result.ok ? { done: true } : { error: result.error };
}
