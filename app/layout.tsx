import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { Providers } from '@/components/layout/providers';

export const metadata: Metadata = {
  applicationName: 'PICC New York',
  title: 'PICC New York',
  description: 'Internal PICC platform for vendor days, dispatch, proof, payroll, accounts, and ROI.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PICC New York',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#c93412',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerk = Boolean(publishableKey && process.env.CLERK_SECRET_KEY);

  const content = (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-[100dvh]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );

  if (!hasClerk) {
    return content;
  }

  return <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider>;
}
