import type { Metadata } from 'next';
import { MicrobarLanding } from './microbar-landing';

export const metadata: Metadata = {
  metadataBase: new URL('https://piccnewyork.org'),
  title: 'Microbar NY | Distributed by PICC',
  description:
    'Microbar cannabis vapes are now available to New York retailers through PICC, including preferred partner pricing and NY assortment details.',
  openGraph: {
    title: 'Microbar NY | Distributed by PICC',
    description:
      'Retailer landing page for Microbar in New York with PICC preferred partner pricing, assortment details, and ordering next steps.',
    images: ['/brand/microbar/ny-menu-hero.webp'],
  },
};

export default function MicrobarPage() {
  return <MicrobarLanding />;
}
