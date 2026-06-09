'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  BatteryCharging,
  Check,
  ExternalLink,
  Mail,
  Package,
  Phone,
  Sparkles,
  Zap,
} from 'lucide-react';

type StrainType = 'Sativa' | 'Hybrid' | 'Indica';

type Product = {
  name: string;
  type: StrainType;
  line: 'Quickstrike' | 'Mainline';
  description: string;
  image: string;
  color: string;
};

const products: Product[] = [
  {
    name: 'Rocket Popz',
    type: 'Indica',
    line: 'Quickstrike',
    description:
      'Back for Summer 25. This delightful treat brings the nostalgia of classic popsicles to your taste buds with a refreshing blend of cherry, lime, and blue raspberry flavors. Each puff offers a sweet, tangy burst that cools you down on even the hottest summer days.',
    image: '/brand/microbar/rocket-popz.webp',
    color: '#10b7ff',
  },
  {
    name: 'Blackberry Slush',
    type: 'Sativa',
    line: 'Quickstrike',
    description:
      'A new Quickstrike from Micro Bar with an irresistible combination of sweetness and subtle tartness. The luscious taste of ripe blackberries washes over your palate, with an initial burst of sweetness balanced by a hint of tartness.',
    image: '/brand/microbar/blackberry-slush.webp',
    color: '#3342ff',
  },
  {
    name: 'Golden Dragon Fruit',
    type: 'Hybrid',
    line: 'Mainline',
    description:
      'A twist on the popular Year of the Dragon Fruit Quickstrike, brought into the Mainline collection. This blend of sweet and tangy golden dragon fruit, complemented by succulent fruits, delivers an exciting and bold taste experience.',
    image: '/brand/microbar/golden-dragon-fruit.webp',
    color: '#ffe000',
  },
  {
    name: 'Peach Driver',
    type: 'Hybrid',
    line: 'Mainline',
    description:
      'Whether it is cobbler for dessert or iced tea in the heat, Peach Driver offers unmistakable peach flavor. This hybrid has the taste of a fuzzy, succulent peach and an energizing effect suited for social activities and exploring outdoors.',
    image: '/brand/microbar/peach-driver.webp',
    color: '#ff9f31',
  },
  {
    name: 'Strawberry Mochi',
    type: 'Hybrid',
    line: 'Mainline',
    description:
      'A balance of sweet, berry, and creamy. Each puff delivers the juicy taste of ripe strawberries, followed by a smooth, velvety mochi finish. Crafted for a satisfying dessert-inspired blend that is refreshing yet indulgent.',
    image: '/brand/microbar/strawberry-mochi.webp',
    color: '#ff9ac7',
  },
  {
    name: 'Pink Lychee',
    type: 'Hybrid',
    line: 'Mainline',
    description:
      'An exotic blend of sweetness and tropical paradise. Pink Lychee offers a sense of steadiness, made for shoppers with a sweet tooth and the need to stay grounded.',
    image: '/brand/microbar/pink-lychee.webp',
    color: '#ff7ab8',
  },
  {
    name: 'Lemon Diesel',
    type: 'Sativa',
    line: 'Mainline',
    description:
      'This mouth-puckering sativa has clear notes of sharp juicy citrus. Lemon Diesel leaves a deeply relaxed feel and a lemon-like daze.',
    image: '/brand/microbar/lemon-diesel.webp',
    color: '#bdf500',
  },
  {
    name: 'Melon Bar',
    type: 'Sativa',
    line: 'Quickstrike',
    description:
      'A creamy, fruity concoction that embodies the refreshing sweetness of ripe melon, leaving a smooth, velvety finish. Bright, juicy, and indulgent, this limited edition is built around a well-balanced melon flavor.',
    image: '/brand/microbar/melon-bar.webp',
    color: '#9ce600',
  },
  {
    name: 'Zhirley Temple',
    type: 'Hybrid',
    line: 'Quickstrike',
    description:
      'A blend of sweet and tangy lemon-lime soda, hints of grenadine, and maraschino cherry. The flavor is designed to transport shoppers to a classic soda fountain.',
    image: '/brand/microbar/zhirley-temple.webp',
    color: '#d71920',
  },
  {
    name: 'Strawberry Fields',
    type: 'Indica',
    line: 'Mainline',
    description:
      'A classic red berry profile: fresh, sweet, and perfectly tart. Strawberry Fields is a heavy indica that relaxes, recenters, and recalls warm summer days with juicy berries.',
    image: '/brand/microbar/strawberry-fields.webp',
    color: '#ff6c9d',
  },
  {
    name: 'Blueberry Kush',
    type: 'Indica',
    line: 'Mainline',
    description:
      'A heavy indica with a flavor profile somewhere between delicate blueberries. Blueberry Kush is a familiar strain lane for shoppers looking for a fruit-forward indica.',
    image: '/brand/microbar/blueberry-kush.webp',
    color: '#2831e8',
  },
];

const filters: Array<'All' | StrainType> = ['All', 'Sativa', 'Hybrid', 'Indica'];

const nabisMenuHref = 'https://retailer.nabis.com/public/brands/5907f171-2675-4fa7-8848-bc0250d9cf37?inStock=true&preview=true';
const contactEmail = 'bryce@piccplatform.com';
const contactPhone: string | null = null;
const contactSubject = encodeURIComponent('Micro Bar NY menu question');
const contactBody = encodeURIComponent(
  [
    'Hi Bryce,',
    '',
    'I was looking at the Micro Bar NY page and had a question.',
    '',
    'Dispensary / buyer:',
    'License or location:',
    'Question:',
    '',
    'Please send current availability or point me to the right item on Nabis.',
  ].join('\n'),
);

const contactHref = `mailto:${contactEmail}?subject=${contactSubject}&body=${contactBody}`;

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
              href={nabisMenuHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-black text-[#14131d] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#fff3f7]"
            >
              Live menu
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
              Micro Bar is live for New York retail buyers.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/78 sm:mt-6 sm:text-lg sm:leading-8">
              Micro Bar is now distributed by PICC in New York. Review the live Nabis menu for current in-stock items, then email
              Bryce for availability questions, buyer fit, or help placing the right items into your next replenishment plan.
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
                href={nabisMenuHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ff2456] px-6 py-3 text-sm font-black text-white shadow-xl shadow-[#ff2456]/30 transition hover:-translate-y-0.5 hover:bg-[#ff3e69]"
              >
                View live Nabis menu
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href={contactHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-black text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/14"
              >
                Email Bryce
                <Mail className="h-4 w-4" aria-hidden="true" />
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
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Cherry, lime, and blue raspberry nostalgia in a limited summer Quickstrike profile.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/15 bg-[#14131d]/88 p-4 text-white shadow-xl backdrop-blur">
                    <ExternalLink className="h-5 w-5 text-[#72e8ff]" aria-hidden="true" />
                    <div className="mt-4 text-2xl font-black">Live</div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/56">Nabis menu</div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-[#14131d]/88 p-4 text-white shadow-xl backdrop-blur">
                    <Mail className="h-5 w-5 text-[#ffd84c]" aria-hidden="true" />
                    <div className="mt-4 text-2xl font-black">PICC</div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/56">buyer contact</div>
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
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">The quick buyer read.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Use this page as the fast overview before checking the live Nabis profile. The lineup is flavor-forward, easy to
              segment by effect lane, and simple for retail teams to explain at the counter.
            </p>
            <a
              href={nabisMenuHref}
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#11131a] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#262936]"
            >
              Check the live Nabis menu
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Price read', '$25 standard unit and $20 PPP unit details are clear before you open the marketplace profile.'],
              ['Shelf read', 'Flavor names, device colors, and limited Quickstrike drops give budtenders an easy recommendation path.'],
              ['Pack detail', '10-unit case packs make it straightforward to compare the assortment against your current vape shelf.'],
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
              <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Browse the NY product details by effect lane.</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
                Filter the assortment and compare Micro Bar&apos;s real product descriptions. For live inventory and final item details,
                use the Nabis marketplace profile.
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
                    <p className="mt-2 text-sm leading-5 text-slate-600">{product.description}</p>
                  </div>
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
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50">Selected product detail</div>
                  <div className="mt-1 text-2xl font-black">{selectedProduct.name}</div>
                  <div className="mt-1 text-sm text-white/62">
                    Showing {selectedCount} {selectedType === 'All' ? 'total' : selectedType.toLowerCase()} SKUs.
                  </div>
                </div>
              </div>
              <a
                href={nabisMenuHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ff2456] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#ff3e69]"
              >
                View live Nabis menu
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
              <h3 className="mt-4 text-2xl font-black">DUAL Peach Driver / Watermelon Mimosa.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Peach Driver delivers a smooth, juicy punch of ripe peaches, while Watermelon Mimosa brings crisp, bubbly watermelon
                sweetness with a hint of citrus sparkle. Use each flavor on its own or mix them together.
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
              <h3 className="mt-4 text-2xl font-black">Liquid Gold Live Resin.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                A premium Micro Bar format for buyers who want a live resin shelf option alongside the core flavor assortment.
                Confirm active NY availability on the Nabis profile.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Pricing and pack details stay simple.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              The shelf story is colorful; the buyer math is easy to scan. Use Nabis for live menu status and current in-stock
              assortment.
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
              $600 minimum applies for Preferred Partners when shipped with PICC replenishment. Current menu availability is
              maintained on the Micro Bar Nabis marketplace profile.
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
            <h2 className="text-3xl font-black tracking-tight">Questions about Micro Bar in NY?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
              Check the live Nabis menu for in-stock items. If you want help deciding what fits your shelf, email Bryce directly.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <a
              href={nabisMenuHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-[#11131a] transition hover:-translate-y-0.5 hover:bg-[#fff3f7]"
            >
              View live Nabis menu
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href={contactHref}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/14"
            >
              Email Bryce
              <Mail className="h-4 w-4" aria-hidden="true" />
            </a>
            {contactPhone ? (
              <a
                href={`tel:${contactPhone}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/14"
              >
                Call Bryce
                <Phone className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
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
