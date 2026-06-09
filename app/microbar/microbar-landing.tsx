'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, BatteryCharging, Check, Download, ExternalLink, Mail, Package, Sparkles, Zap } from 'lucide-react';

type StrainType = 'Sativa' | 'Hybrid' | 'Indica';

type Product = {
  name: string;
  type: StrainType;
  note: string;
  color: string;
};

const products: Product[] = [
  { name: 'Blackberry Slush', type: 'Sativa', note: 'Berry-forward, tart, and bright.', color: '#4259ff' },
  { name: 'Lemon Diesel', type: 'Sativa', note: 'Citrus fuel profile for daytime shelves.', color: '#b5f000' },
  { name: 'Melon Bar', type: 'Sativa', note: 'Ripe melon with a clean finish.', color: '#98e000' },
  { name: 'Golden Dragon Fruit', type: 'Hybrid', note: 'Tropical, bold, and high-visibility.', color: '#ffe100' },
  { name: 'Peach Driver', type: 'Hybrid', note: 'Peach-forward and approachable.', color: '#ff9fc8' },
  { name: 'Pink Lychee', type: 'Hybrid', note: 'Soft fruit profile with premium shelf color.', color: '#f890c8' },
  { name: 'Strawberry Mochi', type: 'Hybrid', note: 'Sweet strawberry dessert profile.', color: '#ffc4df' },
  { name: 'Zhirley Temple', type: 'Hybrid', note: 'Maraschino-style limited edition flavor.', color: '#d71920' },
  { name: 'Blueberry Kush', type: 'Indica', note: 'Blueberry-heavy evening position.', color: '#2634d9' },
  { name: 'Rocket Popz', type: 'Indica', note: 'Red-white-blue quickstrike profile.', color: '#0fb7ff' },
  { name: 'Strawberry Fields', type: 'Indica', note: 'Classic red berry flavor.', color: '#ff89b2' },
];

const filters: Array<'All' | StrainType> = ['All', 'Sativa', 'Hybrid', 'Indica'];

const inquirySubject = encodeURIComponent('Microbar NY ordering details');
const inquiryBody = encodeURIComponent(
  [
    'Hi PICC,',
    '',
    'I would like Microbar NY ordering details.',
    '',
    'Retailer / account:',
    'Preferred delivery window:',
    'Products of interest:',
    '',
    'Please send current availability, preferred partner details, and next steps.',
  ].join('\n'),
);

const inquiryHref = `mailto:microbar@phatpanda.com?cc=bryce@piccplatform.com&subject=${inquirySubject}&body=${inquiryBody}`;

export function MicrobarLanding() {
  const [selectedType, setSelectedType] = useState<(typeof filters)[number]>('All');
  const [selectedProduct, setSelectedProduct] = useState(products[1]);

  const visibleProducts = useMemo(() => {
    if (selectedType === 'All') {
      return products;
    }

    return products.filter((product) => product.type === selectedType);
  }, [selectedType]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#16181d]">
      <section className="relative isolate overflow-hidden bg-[#11131a] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_22%_18%,rgba(0,207,255,0.36),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(255,30,139,0.42),transparent_26%),linear-gradient(135deg,#11131a_0%,#211945_52%,#c93412_150%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[#f7f8fb] to-transparent" />

        <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.18em] text-white/85">
            PICC New York
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#assortment" className="hidden rounded-full px-3 py-2 text-white/78 transition hover:bg-white/10 hover:text-white sm:inline-flex">
              Assortment
            </a>
            <a href="#pricing" className="hidden rounded-full px-3 py-2 text-white/78 transition hover:bg-white/10 hover:text-white sm:inline-flex">
              Pricing
            </a>
            <a
              href={inquiryHref}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-semibold text-[#171922] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#f0f7ff]"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Request details
            </a>
          </nav>
        </header>

        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-24 pt-8 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:pb-28 lg:pt-12">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-3 py-2 text-sm font-medium text-white/82 backdrop-blur">
              <Sparkles className="h-4 w-4 text-[#6ee7ff]" aria-hidden="true" />
              Now distributed by PICC in New York
            </div>
            <h1 className="text-5xl font-black leading-[0.94] sm:text-6xl lg:text-7xl">Microbar has landed in NY.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/78">
              PICC retailers can now stock Microbar cannabis vapes with a focused New York assortment, preferred partner pricing,
              and order minimums built around existing PICC shipments.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={inquiryHref}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ff234f] px-6 py-3 text-sm font-bold text-white shadow-xl shadow-[#ff234f]/30 transition hover:-translate-y-0.5 hover:bg-[#ff3d65]"
              >
                Start a Microbar order
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="https://microbar.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/14"
              >
                Visit Microbar
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="relative min-h-[520px]">
            <div className="absolute left-0 top-6 hidden h-24 w-24 rounded-full bg-[#38d5ff] blur-3xl lg:block" />
            <div className="relative ml-auto max-w-2xl">
              <Image
                src="/brand/microbar/ny-menu-hero.webp"
                alt="Microbar Rocket Popz product and NY launch graphics"
                width={1200}
                height={1553}
                priority
                className="h-auto w-full rounded-[28px] border border-white/14 bg-white shadow-2xl shadow-black/35"
              />
              <div className="absolute -bottom-6 left-4 right-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-white/18 bg-[#11131a]/88 text-center text-white shadow-2xl backdrop-blur">
                <div className="px-3 py-4">
                  <div className="text-2xl font-black">$25</div>
                  <div className="text-xs text-white/65">unit price</div>
                </div>
                <div className="border-x border-white/12 px-3 py-4">
                  <div className="text-2xl font-black text-[#ffd54a]">$20</div>
                  <div className="text-xs text-white/65">PPP price</div>
                </div>
                <div className="px-3 py-4">
                  <div className="text-2xl font-black">10</div>
                  <div className="text-xs text-white/65">case pack</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="assortment" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Built for fast retail reads.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              The NY menu gives buyers a clean mix across sativa, hybrid, and indica profiles with high-visibility device colors
              and flavor-led naming that is easy to merchandise.
            </p>
            <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter Microbar products by strain type">
              {filters.map((filter) => {
                const active = filter === selectedType;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setSelectedType(filter)}
                    className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                      active
                        ? 'border-[#11131a] bg-[#11131a] text-white shadow-lg shadow-slate-900/15'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                    aria-pressed={active}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {visibleProducts.map((product) => {
                const active = product.name === selectedProduct.name;

                return (
                  <button
                    key={product.name}
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    className={`group flex min-h-28 flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      active ? 'border-[#ff234f] ring-2 ring-[#ff234f]/15' : 'border-slate-200'
                    }`}
                  >
                    <span className="mb-3 h-2 w-14 rounded-full" style={{ backgroundColor: product.color }} />
                    <span className="text-base font-black text-slate-950">{product.name}</span>
                    <span className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{product.type}</span>
                    <span className="mt-3 text-sm leading-5 text-slate-600">{product.note}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sticky top-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/8">
              <Image
                src="/brand/microbar/ny-menu-assortment.webp"
                alt="Microbar NY assortment sheet with product cards"
                width={1200}
                height={2134}
                className="h-auto w-full rounded-xl"
              />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Selected SKU</div>
                  <div className="mt-1 text-2xl font-black">{selectedProduct.name}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-600">{selectedProduct.type}</div>
                </div>
                <span className="h-10 w-10 rounded-full border border-slate-200" style={{ backgroundColor: selectedProduct.color }} />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Use this selection with the email CTA to ask PICC for availability, shipment timing, and preferred partner ordering.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Preferred partner pricing is simple.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Microbar NY is positioned around a clean retail conversation: $25 standard unit price, $20 preferred partner unit
              price, and 10-unit case packs.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Package, label: 'Case pack', value: '10 units' },
                { icon: Check, label: 'PPP unit', value: '$20' },
                { icon: Zap, label: 'Order minimum', value: '$600' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-[#f7f8fb] p-5">
                  <item.icon className="h-5 w-5 text-[#c93412]" aria-hidden="true" />
                  <div className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                  <div className="mt-1 text-2xl font-black">{item.value}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              $600 minimum applies for Preferred Partners when shipped with PICC orders.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#f7f8fb] p-3 shadow-xl shadow-slate-900/8">
            <Image
              src="/brand/microbar/ppp-menu.webp"
              alt="Microbar preferred partner price sheet"
              width={1200}
              height={1800}
              className="h-auto w-full rounded-xl bg-white"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/8">
            <Image
              src="/brand/microbar/battery-spec.webp"
              alt="Microbar disposable cannabis vape technical specification graphic"
              width={1200}
              height={1800}
              className="h-auto w-full"
            />
          </div>
          <div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#11131a] text-white">
              <BatteryCharging className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">A compact device story buyers can understand.</h2>
            <div className="mt-6 grid gap-3">
              {[
                '1mL visible window capacity',
                '210mAh battery with Type-C charging',
                'Dual airflow and constant voltage output',
                'Button-free disposable format',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <Check className="h-5 w-5 text-[#c93412]" aria-hidden="true" />
                  <span className="text-sm font-semibold text-slate-700">{feature}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="/brand/microbar/ppp-menu.webp"
                download
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#11131a] px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#252936]"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download price sheet
              </a>
              <a
                href={inquiryHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900 transition hover:-translate-y-0.5 hover:border-slate-500"
              >
                Ask for availability
                <Mail className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#11131a] px-5 py-14 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight">Ready to bring Microbar into your NY account?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
              Send PICC your account, preferred delivery window, and SKUs of interest. We will follow up with current availability
              and ordering next steps.
            </p>
          </div>
          <a
            href={inquiryHref}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-[#11131a] transition hover:-translate-y-0.5 hover:bg-[#f0f7ff]"
          >
            Request Microbar details
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>
    </main>
  );
}
