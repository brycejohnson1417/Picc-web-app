import type { Metadata } from 'next';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { evaluateUserAccess } from '@/lib/auth/access-policy';
import { AUTH_BYPASS_MODE } from '@/lib/config/runtime';

export const metadata: Metadata = {
  title: 'PICC New York',
  description: 'Internal PICC operating system for accounts, routing, territory work, sync health, and field execution.',
};

export default async function Page() {
  if (AUTH_BYPASS_MODE) {
    redirect('/home');
  }

  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const access = await evaluateUserAccess(email);

  if (!access.ok) {
    redirect('/sign-in');
  }

  redirect('/home');
}
