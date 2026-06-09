'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BatteryCharging,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Mail,
  Package,
  ShoppingBag,
  Sparkles,
  Zap,
} from 'lucide-react';

type StrainType = 'Sativa' | 'Hybrid' | 'Indica';

type Product = {
  name: string;
  type: StrainType;
  line: 'Quickstrike' | 'Mainline';
  note: string;
  buyerAngle: string;
  image: string;
  color: string;
};

const products: Product[] = [
  {
    name: 'Rocket Popz',
    type: 'Indica',
    line: 'Quickstrike',
    note: 'Cherry, lime, and blue raspberry nostalgia with summer display energy.',
    buyerAngle: 'Limited-run hook for impulse buyers and budtender favorites.',
    image: '/brand/microbar/rocket-popz.webp',
    color: '#10b7ff',
  },
  {
    name: 'Blackberry Slush',
    type: 'Sativa',
    line: 'Quickstrike',
    note: 'Ripe blackberry sweetness with a tart frozen-drink finish.',
    buyerAngle: 'Fast read on shelf: dark fruit, bright color, easy recommendation.',
    image: '/brand/microbar/blackberry-slush.webp',
    color: '#3342ff',
  },
  {
    name: 'Golden Dragon Fruit',
    type: 'Hybrid',
    line: 'Mainline',
    note: 'Golden dragon fruit with tropical fruit depth and bold yellow packaging.',
    buyerAngle: 'High-visibility hero SKU for customers who shop by flavor first.',
    image: '/brand/microbar/golden-dragon-fruit.webp',
    color: '#ffe000',
  },
  {
    name: 'Peach Driver',
    type: 'Hybrid',
    line: 'Mainline',
    note: 'Juicy peach profile that lands cleanly with mainstream vape buyers.',
    buyerAngle: 'A low-friction hybrid for first-time Micro Bar placements.',
    image: '/brand/microbar/peach-driver.webp',
    color: '#ff9f31',
  },
  {
    name: 'Strawberry Mochi',
    type: 'Hybrid',
    line: 'Mainline',
    note: 'Sweet strawberry with a creamy dessert finish.',
    buyerAngle: 'Dessert strain that merchandises well beside fruit-forward vapes.',
    image: '/brand/microbar/strawberry-mochi.webp',
    color: '#ff9ac7',
  },
  {
    name: 'Pink Lychee',
    type: 'Hybrid',
    line: 'Mainline',
    note: 'Soft lychee sweetness with premium pink shelf appeal.',
    buyerAngle: 'A distinctive flavor name buyers remember after one pass.',
    image: '/brand/microbar/pink-lychee.webp',
    color: '#ff7ab8',
  },
  {
    name: 'Lemon Diesel',
    type: 'Sativa',
    line: 'Mainline',
    note: 'Sharp citrus with a diesel edge for classic sativa shoppers.',
    buyerAngle: 'Bridges flavor buyers and strain-name traditionalists.',
    image: '/brand/microbar/lemon-diesel.webp',
    color: '#bdf500',
  },
  {
    name: 'Melon Bar',
    type: 'Sativa',
    line: 'Quickstrike',
    note: 'Ripe melon sweetness with a clean, bright finish.',
    buyerAngle: 'Fresh, friendly flavor profile for daytime vape cases.',
    image: '/brand/microbar/melon-bar.webp',
    color: '#9ce600',
  },
  {
    name: 'Zhirley Temple',
    type: 'Hybrid',
    line: 'Quickstrike',
    note: 'Grenadine, lemon-lime soda, and maraschino cherry.',
    buyerAngle: 'Conversation-starting limited edition with nostalgic pull.',
    image: '/brand/microbar/zhirley-temple.webp',
    color: '#d71920',
  },
  {
    name: 'Strawberry Fields',
    type: 'Indica',
    line: 'Mainline',
    note: 'Classic red berry profile with approachable indica positioning.',
    buyerAngle: 'A simple anchor SKU when buyers want fruit plus nighttime use.',
    image: '/brand/microbar/strawberry-fields.webp',
    color: '#ff6c9d',
  },
  {
    name: 'Blueberry Kush',
    type: 'Indica',
    line: 'Mainline',
    note: 'Blueberry-forward indica with recognizable Kush language.',
    buyerAngle: 'Familiar strain cue for experienced shoppers.',
    image: '/brand/microbar/blueberry-kush.webp',
    color: '#2831e8',
  },
];

const filters: Array<'All' | StrainType> = ['All', 'Sativa', 'Hybrid', 'Indica'];

const orderSubject = encodeURIComponent('Micro Bar NY wholesale order');
const orderBody = encodeURIComponent(
  [
    'Hi PICC,',
    '',
    'I am interested in Micro Bar for our dispensary.',
    '',
    'Dispensary / buyer:',
    'License or location:',
    'Preferred delivery window:',
    'Products of interest:',
    'Estimated opening order:',
    '',
    'Please send current availability, wholesale ordering details, and preferred partner terms.',
  ].join('\n'),
);

const orderHref = `mailto:microbar@phatpanda.com?cc=bryce@piccplatform.com&subject=${orderSubject}&body=${orderBody}`;

export function MicrobarLanding() {
  const [selectedType, setSelectedType] = useState<(typeof filters)[number]>('All');
  const [selectedProduct, setSelectedProduct] = useState(products[0]);

  const visibleProducts = useMemo(() => {
    if (selectedType === 'All') {
      return products;
    }

    return products.filter((product) => product.type === selectedType);
  }, [selectedType]);

  const selectedCount = visibleProducts.length;

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-[#11131a]">
      <section className="relative isolate overflow-hidden bg-[#12111b] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_14%_18%,rgba(0,196,255,0.34),transparent_30%),radial-gradient(circle_at_78%_5%,rgba(255,24,128,0.46),transparent_28%),linear-gradient(135deg,#11131a_0%,#24163f_54%,#c93412_145%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#f6f7fb] to-transparent" />

        <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="text-sm font-black uppercase tracking-[0.2em] text-white/88">
            PICC New York
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#buyer-case" className="hidden rounded-full px-3 py-2 font-semibold text-white/75 transition hover:bg-white/10 hover:text-white lg:inline-flex">
              Buyer case
            </a>
            <a href="#lineup" className="hidden rounded-full px-3 py-2 font-semibold text-white/75 transition hover:bg-white/10 hover:text-white sm:inline-flex">
              Lineup
            </a>
            <a
              href={orderHref}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-black text-[#14131d] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#fff3f7]"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Get terms
            </a>
          </nav>
        </header>

        <div className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-24 lg:pt-12">
          <div className="max-w-2xl">
            <Image
              src="/brand/microbar/logo-white.webp"
              alt="Micro Bar"
              width={900}
              height={320}
              priority
              className="mb-5 h-auto w-36 sm:mb-7 sm:w-56"
            />
            <h1 className="text-4xl font-black leading-[0.94] sm:text-6xl lg:text-7xl">
              The vape line NY buyers can merchandise in one pass.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/78 sm:mt-6 sm:text-lg sm:leading-8">
              Micro Bar is now available through PICC in New York with a tight opening assortment, buyer-friendly case economics,
              and color-coded SKUs that make budtender recommendations easy.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
              {[
                ['$25', 'standard unit'],
                ['$20', 'PPP unit'],
                ['10', 'unit case pack'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-white/14 bg-white/8 p-3 backdrop-blur sm:rounded-2xl sm:p-4">
                  <div className="text-2xl font-black text-white sm:text-3xl">{value}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/58 sm:text-xs sm:tracking-[0.16em]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <a
                href={orderHref}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ff2456] px-6 py-3 text-sm font-black text-white shadow-xl shadow-[#ff2456]/30 transition hover:-translate-y-0.5 hover:bg-[#ff3e69]"
              >
                Request wholesale terms
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="#lineup"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-black text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/14"
              >
                Build an opening set
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="relative min-h-[540px]">
            <div className="absolute left-6 top-8 h-64 w-64 rounded-full bg-[#26d6ff]/30 blur-3xl" />
            <div className="absolute bottom-12 right-8 h-64 w-64 rounded-full bg-[#ff2456]/30 blur-3xl" />
            <div className="relative mx-auto grid max-w-[620px] grid-cols-[0.92fr_1.08fr] gap-4">
              <div className="mt-20 space-y-4">
                <SkuCard product={products[1]} compact />
                <SkuCard product={products[4]} compact />
              </div>
              <div className="space-y-4">
                <div className="overflow-hidden rounded-[28px] border border-white/15 bg-white/95 p-5 shadow-2xl shadow-black/35">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Launch hero</span>
                    <span className="rounded-full bg-[#ff2456] px-3 py-1 text-xs font-black text-white">Quickstrike</span>
                  </div>
                  <Image
                    src="/brand/microbar/rocket-popz.webp"
                    alt="Micro Bar Rocket Popz device"
                    width={1100}
                    height={1100}
                    className="aspect-square h-auto w-full object-contain"
                  />
                  <div className="mt-3 text-2xl font-black text-[#12111b]">Rocket Popz</div>
                  <p className="mt-1 text-sm leading-5 text-slate-600">A recognizable limited flavor that gives buyers a reason to test the line now.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/15 bg-[#14131d]/88 p-4 text-white shadow-xl backdrop-blur">
                    <ShoppingBag className="h-5 w-5 text-[#72e8ff]" aria-hidden="true" />
                    <div className="mt-4 text-2xl font-black">$600</div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/56">PPP minimum</div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-[#14131d]/88 p-4 text-white shadow-xl backdrop-blur">
                    <Package className="h-5 w-5 text-[#ffd84c]" aria-hidden="true" />
                    <div className="mt-4 text-2xl font-black">30</div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/56">3-case open</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="buyer-case" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Why a dispensary buyer says yes.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Educated buyers do not need another disposable pitch. They need clean economics, clear merchandising, and a line their
              team can explain without a training day.
            </p>
            <a
              href={orderHref}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#11131a] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#262936]"
            >
              Ask for opening availability
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Margin story', '$20 PPP unit gives retailers a clean preferred partner conversation without burying the price sheet.'],
              ['Shelf velocity', 'Flavor names, device colors, and limited Quickstrike drops are built for fast customer reads.'],
              ['Low-friction open', '10-unit case packs and a $600 minimum let stores test the line without a bloated category bet.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <Sparkles className="h-5 w-5 text-[#ff2456]" aria-hidden="true" />
                <h3 className="mt-5 text-xl font-black">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="lineup" className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Build the opening set by effect lane.</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
                Filter the NY assortment, pick the hero SKUs for your first order, and send PICC the exact buyer context from the
                CTA. No spreadsheet archaeology required.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end" role="tablist" aria-label="Filter Micro Bar products by effect lane">
              {filters.map((filter) => {
                const active = filter === selectedType;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setSelectedType(filter)}
                    className={`rounded-full border px-4 py-2 text-sm font-black transition ${
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
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleProducts.map((product) => (
              <button
                key={product.name}
                type="button"
                onClick={() => setSelectedProduct(product)}
                className={`group rounded-2xl border bg-[#f7f8fb] p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
                  selectedProduct.name === product.name ? 'border-[#ff2456] ring-2 ring-[#ff2456]/15' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-white p-2">
                    <Image src={product.image} alt={`Micro Bar ${product.name}`} width={900} height={900} className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2.5 py-1 text-xs font-black text-[#11131a]" style={{ backgroundColor: product.color }}>
                        {product.type}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{product.line}</span>
                    </div>
                    <h3 className="mt-3 text-xl font-black leading-tight text-slate-950">{product.name}</h3>
                    <p className="mt-2 text-sm leading-5 text-slate-600">{product.note}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold leading-5 text-slate-700">
                  {product.buyerAngle}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-[#11131a] p-5 text-white shadow-xl shadow-slate-900/15">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white p-2">
                  <Image
                    src={selectedProduct.image}
                    alt={`Selected Micro Bar ${selectedProduct.name}`}
                    width={900}
                    height={900}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">Selected opening SKU</div>
                  <div className="mt-1 text-2xl font-black">{selectedProduct.name}</div>
                  <div className="mt-1 text-sm text-white/62">
                    Showing {selectedCount} {selectedType === 'All' ? 'total' : selectedType.toLowerCase()} SKUs.
                  </div>
                </div>
              </div>
              <a
                href={orderHref}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ff2456] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#ff3e69]"
              >
                Send this order context
                <Mail className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl bg-[#10121a] p-6 text-white lg:col-span-2">
            <div className="grid gap-6 md:grid-cols-[0.95fr_1.05fr] md:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-3 py-2 text-sm font-black text-white/78">
                  <BatteryCharging className="h-4 w-4 text-[#72e8ff]" aria-hidden="true" />
                  Device proof
                </div>
                <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Small form, clean spec story.</h2>
                <p className="mt-4 text-base leading-7 text-white/68">
                  Buyers can sell the device in one sentence: 1mL visible oil window, Type-C charging, 210mAh battery, and dual
                  airflow in a pocketable disposable.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {['1mL visible window', '210mAh battery', 'Type-C charging', 'Dual airflow'].map((feature) => (
                    <div key={feature} className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/8 p-3">
                      <Check className="h-4 w-4 text-[#72e8ff]" aria-hidden="true" />
                      <span className="text-sm font-bold text-white/82">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Image
                src="/brand/microbar/battery-spec-native.webp"
                alt="Micro Bar battery and device specification"
                width={1400}
                height={1400}
                className="h-auto w-full rounded-2xl bg-white"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Image
                src="/brand/microbar/dual-peach-watermelon.webp"
                alt="Micro Bar Dual Peach Driver and Watermelon Mimosa"
                width={1000}
                height={1000}
                className="mx-auto h-52 w-full object-contain"
              />
              <h3 className="mt-4 text-2xl font-black">DUAL gives buyers a trade-up lane.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Two 0.5g tanks, switchable strains, and blend behavior create a premium conversation beyond single-flavor disposables.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Image
                src="/brand/microbar/liquid-gold-yellow.webp"
                alt="Micro Bar Liquid Gold live resin device"
                width={1000}
                height={1000}
                className="mx-auto h-44 w-full object-contain"
              />
              <h3 className="mt-4 text-2xl font-black">Liquid Gold protects premium shelf space.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Live Resin positioning gives experienced buyers a reason to place Micro Bar above commodity vape rows.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">The opening order math is intentionally boring.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Boring is good for a wholesale buyer. The shelf story is colorful; the economics are simple enough to approve fast.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Package, label: 'Case pack', value: '10 units' },
                { icon: Check, label: 'PPP unit', value: '$20' },
                { icon: Zap, label: 'Minimum', value: '$600' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-[#f7f8fb] p-5">
                  <item.icon className="h-5 w-5 text-[#ff2456]" aria-hidden="true" />
                  <div className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                  <div className="mt-1 text-2xl font-black">{item.value}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              $600 minimum applies for Preferred Partners when shipped with PICC orders. Current availability is confirmed through
              PICC before order submission.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-[#f7f8fb] p-3 shadow-xl shadow-slate-900/8">
            <Image
              src="/brand/microbar/ppp-menu.webp"
              alt="Micro Bar preferred partner price sheet"
              width={1200}
              height={1800}
              className="h-auto w-full rounded-2xl bg-white"
            />
          </div>
        </div>
      </section>

      <section className="bg-[#11131a] px-5 py-14 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Image src="/brand/microbar/logo-white.webp" alt="Micro Bar" width={900} height={320} className="mb-5 h-auto w-36" />
            <h2 className="text-3xl font-black tracking-tight">Want the current NY availability list?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
              Send PICC your dispensary, delivery window, and opening-order target. We will respond with live availability,
              preferred partner terms, and the cleanest first order for your shelf.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <a
              href={orderHref}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-[#11131a] transition hover:-translate-y-0.5 hover:bg-[#fff3f7]"
            >
              Request wholesale terms
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href="/brand/microbar/ppp-menu.webp"
              download
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/14"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Price sheet
            </a>
            <a
              href="https://microbar.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/14"
            >
              Microbar.com
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function SkuCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/92 p-4 shadow-xl shadow-black/20 backdrop-blur">
      <Image
        src={product.image}
        alt={`Micro Bar ${product.name}`}
        width={900}
        height={900}
        className={`${compact ? 'h-24' : 'h-36'} w-full object-contain`}
      />
      <div className="mt-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: product.color }} />
        <div className="text-sm font-black text-[#12111b]">{product.name}</div>
      </div>
      <div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{product.type}</div>
    </div>
  );
}
