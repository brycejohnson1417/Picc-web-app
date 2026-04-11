'use client';

import { useMemo, useState } from 'react';
import type { NotionVendorDayEvent } from '@/lib/server/notion-vendor-days';
import type { PublicMenuItem, PublicStore } from '@/lib/site/public-nabis';

interface PublicHomePageClientProps {
  stores: PublicStore[];
  menuItems: PublicMenuItem[];
  brandOptions: string[];
  productOptions: string[];
  vendorDays: NotionVendorDayEvent[];
  generatedAt: string;
  warnings: string[];
}

function toDisplayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMenuImage(item: PublicMenuItem) {
  if (item.imageUrl) {
    return <img src={item.imageUrl} alt={item.productName} className="h-28 w-full rounded-lg object-cover" />;
  }

  return (
    <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-300/60 text-sm text-slate-700">
      No image
    </div>
  );
}

export function PublicHomepageClient({
  stores,
  menuItems,
  brandOptions,
  productOptions,
  vendorDays,
  generatedAt,
  warnings,
}: PublicHomePageClientProps) {
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [showPreferredOnly, setShowPreferredOnly] = useState(false);

  const filteredStores = useMemo(() => {
    const query = search.trim().toLowerCase();
    return stores
      .filter((store) => {
        if (showPreferredOnly && !store.isPreferredPartner) {
          return false;
        }

        if (selectedBrand && !store.brands.includes(selectedBrand)) {
          return false;
        }

        if (selectedProduct && !store.products.includes(selectedProduct)) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = [store.name, store.address, store.city, store.state, ...store.brands, ...store.products]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (a.isPreferredPartner !== b.isPreferredPartner) {
          return a.isPreferredPartner ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [search, selectedBrand, selectedProduct, showPreferredOnly, stores]);

  const filteredMenu = useMemo(() => {
    return menuItems
      .filter((item) => {
        if (selectedBrand && item.brand !== selectedBrand) {
          return false;
        }

        if (selectedProduct && !item.productName.includes(selectedProduct)) {
          return false;
        }

        return true;
      })
      .slice(0, 120);
  }, [selectedBrand, selectedProduct, menuItems]);

  const activeFilters = selectedBrand || selectedProduct || search || showPreferredOnly;
  const upcomingEvents = vendorDays.slice(0, 6);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-8 pt-4">
      <section className="rounded-2xl border border-[#c9cad0] bg-white/80 p-4 shadow-sm sm:p-6">
        <h2 className="text-2xl font-bold text-[#17181c]">Find PICC Preferred retailers and partner stores</h2>
        <p className="mt-2 text-sm text-[#4b4f58]">
          Search by ZIP, city, retailer name, product, or brand. Each store includes live Nabis brand/product carry data from market activity.
        </p>
        {warnings.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-800">
            {warnings.join(' ')}
          </div>
        ) : null}
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className="rounded-lg border border-[#c9cad0] px-3 py-2 outline-none ring-0 ring-transparent transition focus:border-[#c93412]"
            placeholder="Search stores, city, or address"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search store locator"
          />
          <select
            className="rounded-lg border border-[#c9cad0] px-3 py-2 outline-none"
            value={selectedBrand}
            onChange={(event) => setSelectedBrand(event.target.value)}
            aria-label="Filter by brand"
          >
            <option value="">All Brands</option>
            {brandOptions.map((brand) => (
              <option value={brand} key={brand}>
                {brand}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-[#c9cad0] px-3 py-2 outline-none"
            value={selectedProduct}
            onChange={(event) => setSelectedProduct(event.target.value)}
            aria-label="Filter by product"
          >
            <option value="">All Products</option>
            {productOptions.map((product) => (
              <option value={product} key={product}>
                {product}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-[#c9cad0] bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={showPreferredOnly}
              onChange={(event) => setShowPreferredOnly(event.target.checked)}
            />
            Show PICC Preferred Partner only
          </label>
        </div>
        {activeFilters ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[#17181c] px-3 py-1 text-white">Filtered</span>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedBrand('');
                setSelectedProduct('');
                setShowPreferredOnly(false);
              }}
              className="rounded-full border border-[#17181c] px-3 py-1 text-[#17181c]"
            >
              Clear all filters
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xl font-semibold text-[#17181c]">Store Locator</h3>
          <p className="text-sm text-[#6f747f]">{filteredStores.length} stores</p>
        </div>
        {filteredStores.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#c9cad0] p-3 text-sm text-[#6f747f]">No stores match your filters.</p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredStores.map((store) => {
            const location = [store.city, store.state].filter(Boolean).join(', ');
            const title = [store.address, location].filter(Boolean).join(' · ');
            const hasContact = Boolean(store.phoneNumber || store.email);
            const storeUrl = store.latitude && store.longitude ? `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}` : null;

            return (
              <article key={store.id} className="rounded-2xl border border-[#d6d8df] bg-white p-4">
                <div className="mb-2 flex items-start justify-between">
                  <h4 className="text-lg font-semibold text-[#17181c]">{store.name}</h4>
                  <div className="text-right">
                    {store.isPreferredPartner ? (
                      <span className="inline-block rounded-full bg-[#0f766e] px-2 py-1 text-xs text-white">Preferred Partner</span>
                    ) : null}
                    {store.isCustomer ? (
                      <p className="mt-1 text-xs font-medium uppercase text-[#c93412]">NABIS customer</p>
                    ) : null}
                  </div>
                </div>
                {title ? <p className="text-sm text-[#4d5661]">{title}</p> : null}
                <p className="mt-2 text-xs text-[#6f747f]">
                  {store.status}
                  {store.licenseNumber ? ` · License ${store.licenseNumber}` : ''}
                </p>
                {store.brands.length > 0 ? (
                  <p className="mt-3 text-xs uppercase tracking-wide text-[#8a919c]">Brands in marketplace activity</p>
                ) : null}
                {store.brands.length > 0 ? (
                  <p className="text-sm text-[#3c414a]">
                    {store.brands.slice(0, 6).join(', ')}
                    {store.brands.length > 6 ? ` +${store.brands.length - 6} more` : ''}
                  </p>
                ) : null}
                {store.products.length > 0 ? (
                  <>
                    <p className="mt-2 text-xs uppercase tracking-wide text-[#8a919c]">Products</p>
                    <p className="text-sm text-[#3c414a]">{store.products.slice(0, 6).join(', ')}</p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-[#8a919c]">No mapped product carry history yet.</p>
                )}
                {hasContact ? <p className="mt-2 text-xs text-[#8a919c]">Contact available</p> : null}
                {storeUrl ? (
                  <a
                    href={storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex rounded-lg bg-[#c93412] px-3 py-2 text-sm font-medium text-white"
                  >
                    Open Directions
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xl font-semibold text-[#17181c]">Live Nabis menu</h3>
          <p className="text-sm text-[#6f747f]">Synced with marketplace live availability</p>
        </div>
        {filteredMenu.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#c9cad0] p-3 text-sm text-[#6f747f]">No products match your selected filters.</p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {filteredMenu.map((item) => (
            <article key={`${item.skuCode}-${item.productName}`} className="rounded-2xl border border-[#d6d8df] bg-white p-3">
              {formatMenuImage(item)}
              <h4 className="mt-3 text-sm font-semibold text-[#17181c]">{item.productName}</h4>
              {item.brand ? <p className="mt-1 text-xs text-[#8a919c]">{item.brand}</p> : null}
              {item.description ? <p className="mt-2 text-xs text-[#4d5661]">{item.description}</p> : null}
              <div className="mt-2 text-xs text-[#6f747f]">
                <p>{item.availableQuantity} available unit-equivalent</p>
                {item.strainType ? <p>{item.strainType}</p> : null}
                {item.pricePerUnit ? <p>${item.pricePerUnit} / unit</p> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xl font-semibold text-[#17181c]">Upcoming Vendor Days</h3>
          <p className="text-sm text-[#6f747f]">Updated from Notion</p>
        </div>
        {upcomingEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#c9cad0] p-3 text-sm text-[#6f747f]">No upcoming Vendor Days found.</p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcomingEvents.map((event) => (
            <article key={event.id} className="rounded-2xl border border-[#d6d8df] bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#c93412]">{toDisplayDate(event.eventDate)}</p>
              <h4 className="mt-2 text-lg font-semibold text-[#17181c]">{event.accountName}</h4>
              <p className="mt-1 text-sm text-[#4d5661]">
                {event.repName ? `Rep: ${event.repName}` : ''}
                {event.ambassadorName ? ` · Ambassador: ${event.ambassadorName}` : ''}
              </p>
              {event.notes ? <p className="mt-2 text-sm text-[#4d5661]">{event.notes}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[#c9cad0] bg-slate-900/90 p-6 text-white">
        <h3 className="text-2xl font-semibold">PICC New York wholesale intelligence</h3>
        <p className="mt-2 text-sm text-slate-200">
          Real-time product data and store-level carry signals help wholesalers and retail operators discover where key brands and SKU-level products are
          actively sold in New York.
        </p>
        <p className="mt-3 text-xs text-slate-300">Data synced at: {toDisplayDate(generatedAt)}</p>
      </section>
    </main>
  );
}

export default PublicHomepageClient;
