import { GoogleOnlySignInCard } from '@/components/auth/google-only-sign-in-card';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(201,52,18,0.16),_transparent_40%),linear-gradient(180deg,_#fff7ed_0%,_#ffffff_44%,_#f8fafc_100%)] p-6 dark:bg-[radial-gradient(circle_at_top,_rgba(201,52,18,0.22),_transparent_42%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)]">
      <GoogleOnlySignInCard />
    </div>
  );
}
