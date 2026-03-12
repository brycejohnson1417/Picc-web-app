'use client';

import { useState } from 'react';
import { useSignIn } from '@clerk/nextjs';
import { Button } from '@/components/ui';

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M21.8 12.23c0-.8-.07-1.57-.2-2.3H12v4.36h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.05-4.4 3.05-7.7Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.3-2.56c-.91.61-2.08.97-3.47.97-2.66 0-4.92-1.8-5.72-4.22H2.88v2.64A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.28 13.72A6.03 6.03 0 0 1 5.96 12c0-.6.11-1.18.32-1.72V7.64H2.88A10 10 0 0 0 2 12c0 1.61.39 3.14 1.08 4.36l3.2-2.64Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.06c1.5 0 2.85.52 3.91 1.53l2.93-2.93C17.07 3.01 14.75 2 12 2a10 10 0 0 0-9.12 5.64l3.4 2.64C7.08 7.86 9.34 6.06 12 6.06Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function formatClerkError(error: unknown) {
  if (typeof error === 'object' && error && 'errors' in error && Array.isArray((error as { errors?: unknown[] }).errors)) {
    const [first] = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors ?? [];
    return first?.longMessage || first?.message || 'Google sign-in failed. Try again.';
  }
  return 'Google sign-in failed. Try again.';
}

export function GoogleOnlySignInCard() {
  const { isLoaded, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    if (!isLoaded || !signIn || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/territory',
      });
    } catch (nextError) {
      setError(formatClerkError(nextError));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white/95 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">piccnewyork.org</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Sign in with Google</h1>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          Team members must use a <span className="font-semibold">@piccplatform.com</span> Google account that also exists in the PICC Notion workspace. Invited guests can sign in with the exact Google email address that received their read-only invite.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <Button
          className="h-12 w-full rounded-2xl bg-slate-950 text-base text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          disabled={!isLoaded || isSubmitting}
          onClick={handleGoogleSignIn}
          type="button"
        >
          <GoogleMark />
          {isSubmitting ? 'Redirecting to Google…' : 'Continue with Google'}
        </Button>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Email/password and non-Google sign-in providers are disabled for this app.</p>
        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
