import type { Metadata } from 'next';
import { MicrobarLanding } from './microbar-landing';

export const metadata: Metadata = {
  metadataBase: new URL('https://piccnewyork.org'),
  title: 'Micro Bar NY Wholesale | Distributed by PICC',
  description:
    'Micro Bar cannabis vapes are now available to New York dispensaries through PICC with buyer-ready assortment details, live Nabis menu access, and direct PICC contact.',
  openGraph: {
    title: 'Micro Bar NY Wholesale | Distributed by PICC',
    description:
      'A buyer-ready wholesale landing page for Micro Bar in New York with PICC assortment context, live Nabis menu access, and direct buyer contact.',
    images: ['/brand/microbar/rocket-popz.webp'],
  },
};

export default function MicrobarPage() {
  return <MicrobarLanding />;
}
