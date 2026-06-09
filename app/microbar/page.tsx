import type { Metadata } from 'next';
import { MicrobarLanding } from './microbar-landing';

export const metadata: Metadata = {
  metadataBase: new URL('https://piccnewyork.org'),
  title: 'Micro Bar NY Wholesale | Distributed by PICC',
  description:
    'Micro Bar cannabis vapes are now available to New York dispensaries through PICC with preferred partner pricing, buyer-ready assortment details, and wholesale ordering next steps.',
  openGraph: {
    title: 'Micro Bar NY Wholesale | Distributed by PICC',
    description:
      'A buyer-ready wholesale landing page for Micro Bar in New York with PICC preferred partner pricing, assortment architecture, and ordering next steps.',
    images: ['/brand/microbar/rocket-popz.webp'],
  },
};

export default function MicrobarPage() {
  return <MicrobarLanding />;
}
