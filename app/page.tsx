import type { Metadata } from 'next';
import Script from 'next/script';
import PublicHomepageClient from '@/components/site/public-homepage-client';
import { getPublicHomeData } from '@/lib/site/public-nabis';
import type { PublicHomeData } from '@/lib/site/public-nabis';

export const revalidate = 180;

export const metadata: Metadata = {
  title: 'PICC New York | New York Cannabis Distributor, Store Locator, and Nabis Marketplace Menu',
  description:
    'PICC New York is a New York-based wholesale cannabis partner for brands and retailers. Search stores by brand or product, view live Nabis menu inventory, and track upcoming Vendor Day events.',
  keywords: [
    'PICC New York',
    'PICC New York wholesale',
    'NY cannabis distributor',
    'store locator',
    'PICC preferred partner',
    'Nabis marketplace',
    'cannabis brands in New York',
    'Vendor Day events',
  ],
  alternates: {
    canonical: 'https://www.piccnewyork.org/',
  },
  openGraph: {
    type: 'website',
    title: 'PICC New York | Wholesale Cannabis Distributor',
    description: 'Store locator with brand/product filters, live Nabis-backed menu, and upcoming Vendor Days.',
    url: 'https://www.piccnewyork.org',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PICC New York | NY Wholesale Cannabis Distributor',
    description: 'Store locator, live Nabis menu, and Vendor Day updates for New York wholesale retailers.',
  },
};

function buildWebPageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'PICC New York - New York Wholesale Cannabis Distributor',
    description: 'Retailer locator, live menu, and Vendor Day calendar for PICC New York.',
    url: 'https://www.piccnewyork.org',
    inLanguage: 'en-US',
  };
}

function buildWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'PICC New York',
    url: 'https://www.piccnewyork.org',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.piccnewyork.org/?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };
}

function buildBreadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.piccnewyork.org',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Store Locator',
        item: 'https://www.piccnewyork.org',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Live Menu',
        item: 'https://www.piccnewyork.org',
      },
    ],
  };
}

function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PICC New York',
    url: 'https://www.piccnewyork.org',
    description:
      'B2B wholesale cannabis support for the New York market, including store mapping, Brand partnerships, and inventory-backed product catalog data.',
    areaServed: {
      '@type': 'State',
      name: 'New York',
    },
  };
}

function buildMenuSchema(menuItems: { skuCode: string; productName: string; brand: string | null; description: string | null }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: 'PICC Live Nabis Menu',
    itemListElement: menuItems.map((item, index) => ({
      '@type': 'Offer',
      position: index + 1,
      itemOffered: {
        '@type': 'Product',
        name: item.productName,
        sku: item.skuCode,
        brand: item.brand ? { '@type': 'Brand', name: item.brand } : undefined,
        description: item.description || undefined,
      },
      availability: 'https://schema.org/InStock',
    })),
  };
}

function buildFaqSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Can I see live product availability for New York stores?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Our public menu pulls current product and SKU-level inventory details directly from the Nabis marketplace API.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I find a PICC Preferred Partner store?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Use the store locator filter in the public page to show only stores marked as PICC Preferred Partner.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are upcoming Vendor Day events included?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Upcoming Vendor Day events are pulled in from the current Notion event source and shown on this page.',
        },
      },
    ],
  };
}

function buildFallbackHomeData(message: string): PublicHomeData {
  return {
    generatedAt: new Date().toISOString(),
    warnings: [message],
    stores: [],
    menuItems: [],
    vendorDays: [],
    brandOptions: [],
    productOptions: [],
  };
}

export default async function Page() {
  const data = await getPublicHomeData().catch((error: unknown) =>
    buildFallbackHomeData(error instanceof Error ? error.message : 'Unable to load public site content right now.'),
  );

  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 pb-2 pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c93412]">PICC New York Wholesale</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-5xl">
          New York Wholesale Cannabis Distribution for Retailers
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-[#4b4f58] sm:text-base">
          Use the live locator to find stores by brand, product, and PICC Preferred Partner status. Browse the live Nabis menu and see what&apos;s
          currently available for New York accounts, plus upcoming Vendor Day activations.
        </p>
      </section>
      <PublicHomepageClient
        stores={data.stores}
        menuItems={data.menuItems}
        brandOptions={data.brandOptions}
        productOptions={data.productOptions}
        vendorDays={data.vendorDays}
        generatedAt={data.generatedAt}
        warnings={data.warnings}
      />
      <Script
        id="picc-org-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationSchema()) }}
      />
      <Script
        id="picc-webpage-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebPageSchema()) }}
      />
      <Script
        id="picc-website-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteSchema()) }}
      />
      <Script
        id="picc-breadcrumb-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbSchema()) }}
      />
      <Script
        id="picc-menu-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildMenuSchema(data.menuItems.slice(0, 20))) }}
      />
      <Script
        id="picc-faq-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqSchema()) }}
      />
    </>
  );
}
