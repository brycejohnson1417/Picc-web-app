import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { Providers } from '@/components/layout/providers';
import { DEMO_MODE } from '@/lib/config/runtime';

export const metadata: Metadata = {
  title: 'PICC Dispensary CRM',
  description: 'Account-centric CRM for dispensary sales, ops, and finance teams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerk = Boolean(publishableKey && process.env.CLERK_SECRET_KEY);

  const content = (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );

  if (!hasClerk || DEMO_MODE) {
    return content;
  }

  return <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider>;
}
