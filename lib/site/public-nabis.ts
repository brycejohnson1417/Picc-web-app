import 'server-only';

import { loadTerritoryStores } from '@/lib/server/notion-territory';
import { loadNotionVendorDayEvents, type NotionVendorDayEvent } from '@/lib/server/notion-vendor-days';
import type { TerritoryStorePin } from '@/lib/territory/types';

const DEFAULT_API_BASE_URL = 'https://platform-api.nabis.pro';
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_CACHE_TTL_SECONDS = 180;
const DEFAULT_MAX_INVENTORY_PAGES = 24;
const DEFAULT_MAX_RETAILER_PAGES = 24;
const DEFAULT_MAX_ORDER_PAGES = 60;
const MEMORY_CACHE_TTL_MS = 4 * 60 * 1000;

type NabisPaginatedResponse<T = unknown> = {
  data?: T[];
  page?: number;
  totalCount?: number;
  totalNumPages?: number;
  nextPage?: number | null;
};

type CacheRecord<T> = {
  fetchedAt: number;
  payload: T;
};

type NabisRetailerRaw = {
  id?: string;
  name?: string;
  doingBusinessAs?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  siteLicenseNumber?: string;
  [key: string]: unknown;
};

type NabisInventoryRaw = {
  skuCode?: string;
  skuName?: string;
  skuDisplayName?: string | null;
  skuBrandName?: string | null;
  skuProductLine?: string | null;
  skuStrainType?: string | null;
  skuInventoryCategory?: string | null;
  skuInventoryClass?: string | null;
  skuPricePerUnit?: string | number | null;
  skuCasePackSize?: string | number | null;
  skuTotalPrice?: string | number | null;
  warehouseCounts?: Array<{ available?: number | string | null }> | null;
  skuTags?: string[] | null;
  [key: string]: unknown;
};

type NabisOrderRaw = {
  retailerId?: string | null;
  retailer?: string | null;
  siteLicenseNumber?: string | null;
  brandName?: string | null;
  organization?: string | null;
  skuCode?: string | null;
  skuName?: string | null;
  skuDisplayName?: string | null;
  status?: string | null;
  orderAction?: string | null;
  siteCity?: string | null;
  createdDate?: string | null;
};

export interface PublicStore {
  id: string;
  notionPageId: string;
  name: string;
  licenseNumber: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  status: string;
  phoneNumber: string | null;
  email: string | null;
  isPreferredPartner: boolean;
  isCustomer: boolean;
  latitude: number;
  longitude: number;
  brands: string[];
  products: string[];
}

export interface PublicMenuItem {
  skuCode: string;
  productName: string;
  description: string | null;
  brand: string | null;
  imageUrl: string | null;
  strainType: string | null;
  inventoryCategory: string | null;
  inventoryClass: string | null;
  availableQuantity: number;
  pricePerUnit: string | null;
  casePackSize: number | null;
}

export interface PublicHomeData {
  generatedAt: string;
  warnings: string[];
  stores: PublicStore[];
  menuItems: PublicMenuItem[];
  vendorDays: NotionVendorDayEvent[];
  brandOptions: string[];
  productOptions: string[];
}

const responseCache = new Map<string, CacheRecord<unknown>>();

const CANCELED_ORDER_STATUSES = new Set(['CANCELED', 'CANCELLED', 'VOID', 'VOIDED', 'REJECTED', 'REFUNDED']);
const INTERNAL_TRANSFER_ACTIONS = new Set(['PICKUP_FROM_NABIS', 'DROPOFF_TO_NABIS', 'INTERNAL_TRANSFER', 'TRANSFER']);

function readRequiredApiKey() {
  const key = process.env.NABIS_API_KEY?.trim();
  if (!key) {
    throw new Error('NABIS_API_KEY is required for live public menu and store carry data.');
  }
  return key;
}

function readNabisBaseUrl() {
  return process.env.NABIS_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}

function readCacheTtlSeconds() {
  const configured = Number(process.env.PUBLIC_NABIS_CACHE_TTL_SECONDS || DEFAULT_CACHE_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_CACHE_TTL_SECONDS;
}

function toSafeString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function toSafeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numberValue = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  return null;
}

function normalizeLookupValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLicense(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function parseImageUrl(item: NabisInventoryRaw): string | null {
  const candidates = ['image', 'imageUrl', 'image_url', 'photo', 'photoUrl', 'photo_url', 'skuImage', 'skuImageUrl', 'productImage', 'productImageUrl'];
  for (const key of candidates) {
    const value = toSafeString(item[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function cacheGet<T>(key: string): T | null {
  const cached = responseCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.fetchedAt > MEMORY_CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }

  return cached.payload as T;
}

function cacheSet<T>(key: string, payload: T) {
  responseCache.set(key, { payload, fetchedAt: Date.now() });
}

async function requestNabisPage<T>(url: string, apiKey: string): Promise<NabisPaginatedResponse<T>> {
  const revalidate = readCacheTtlSeconds();

  const response = await fetch(url, {
    headers: {
      'x-nabis-access-token': apiKey,
    },
    cache: 'force-cache',
    next: {
      revalidate,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Nabis request failed (${response.status}) for ${url}: ${body}`);
  }

  const payload = (await response.json()) as NabisPaginatedResponse<T>;
  return payload;
}

async function loadNabisRows<T>(path: string, maxPages: number): Promise<T[]> {
  const cacheKey = `${path}:pages=${maxPages}`;
  const cached = cacheGet<T[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = readRequiredApiKey();
  const baseUrl = readNabisBaseUrl();
  const rows: T[] = [];
  let page = 0;
  let pagesScanned = 0;

  while (pagesScanned < maxPages) {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(DEFAULT_PAGE_SIZE));

    const payload = await requestNabisPage<T>(url.toString(), apiKey);
    const pageRows = Array.isArray(payload.data) ? (payload.data as T[]) : [];
    rows.push(...pageRows);

    const nextPage = payload.nextPage;
    pagesScanned += 1;

    if (pageRows.length === 0) {
      break;
    }

    if (typeof nextPage !== 'number' || nextPage < 0) {
      break;
    }

    if (nextPage <= page) {
      break;
    }

    if (typeof payload.totalNumPages === 'number' && nextPage >= payload.totalNumPages) {
      break;
    }

    page = nextPage;
  }

  cacheSet(cacheKey, rows);
  return rows;
}

function sanitizeMenuItem(row: NabisInventoryRaw): PublicMenuItem | null {
  const skuCode = toSafeString(row.skuCode);
  const productName = toSafeString(row.skuDisplayName || row.skuName);
  if (!skuCode || !productName) {
    return null;
  }

  const warehouseRows = Array.isArray(row.warehouseCounts) ? row.warehouseCounts : [];
  const available = warehouseRows.reduce((sum, entry) => sum + (toSafeNumber(entry?.available) || 0), 0);

  const tags =
    Array.isArray(row.skuTags) && row.skuTags.length > 0 ? row.skuTags.map((tag) => toSafeString(tag)).filter(Boolean).join(', ') : null;
  const productLine = toSafeString(row.skuProductLine);
  const description = [tags, productLine].filter(Boolean).join(' · ');

  return {
    skuCode,
    productName,
    description: description || null,
    brand: toSafeString(row.skuBrandName),
    imageUrl: parseImageUrl(row),
    strainType: toSafeString(row.skuStrainType),
    inventoryCategory: toSafeString(row.skuInventoryCategory),
    inventoryClass: toSafeString(row.skuInventoryClass),
    availableQuantity: available,
    pricePerUnit: toSafeString(row.skuPricePerUnit),
    casePackSize: toSafeNumber(row.skuCasePackSize),
  };
}

function resolveStoreMatch({
  orderRetailerId,
  orderRetailerName,
  orderCity,
  orderLicense,
  retailerStoreById,
  storeByLicense,
  storeByName,
  storeByNameCity,
}: {
  orderRetailerId?: string | null;
  orderRetailerName?: string | null;
  orderCity?: string | null;
  orderLicense?: string | null;
  retailerStoreById: Map<string, string>;
  storeByLicense: Map<string, string>;
  storeByName: Map<string, string>;
  storeByNameCity: Map<string, string>;
}) {
  const retailerLicense = normalizeLicense(orderLicense || '');
  if (orderRetailerId) {
    const fromRetailer = retailerStoreById.get(orderRetailerId);
    if (fromRetailer) return fromRetailer;
  }

  if (retailerLicense) {
    const byLicense = storeByLicense.get(retailerLicense);
    if (byLicense) return byLicense;
  }

  const normalizedName = normalizeLookupValue(orderRetailerName || '');
  if (normalizedName) {
    const byName = storeByName.get(normalizedName);
    if (byName) return byName;
  }

  if (normalizedName && orderCity) {
    const byNameCity = storeByNameCity.get(`${normalizedName}|${normalizeLookupValue(orderCity)}`);
    if (byNameCity) return byNameCity;
  }

  return null;
}

function buildVendorDayUpcoming(allEvents: NotionVendorDayEvent[]) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return allEvents
    .filter((event) => {
      const date = new Date(event.eventDate);
      if (Number.isNaN(date.getTime())) {
        return false;
      }
      return date >= now;
    })
    .sort((left, right) => new Date(left.eventDate).getTime() - new Date(right.eventDate).getTime())
    .slice(0, 12);
}

export async function getPublicHomeData(): Promise<PublicHomeData> {
  const warnings: string[] = [];

  const [notionStoresResult, vendorDayResult, retailerResult, inventoryResult, orderResult] = await Promise.allSettled([
    loadTerritoryStores({
      maxLiveGeocodeLookups: 0,
    }),
    loadNotionVendorDayEvents(),
    loadNabisRows<NabisRetailerRaw>(
      '/v2/ny/retailer',
      Number(process.env.PUBLIC_NABIS_MAX_RETAILER_PAGES || DEFAULT_MAX_RETAILER_PAGES),
    ),
    loadNabisRows<NabisInventoryRaw>(
      '/v2/ny/inventory',
      Number(process.env.PUBLIC_NABIS_MAX_INVENTORY_PAGES || DEFAULT_MAX_INVENTORY_PAGES),
    ),
    loadNabisRows<NabisOrderRaw>(
      '/v2/ny/order',
      Number(process.env.PUBLIC_NABIS_MAX_ORDER_PAGES || DEFAULT_MAX_ORDER_PAGES),
    ),
  ]);

  if (notionStoresResult.status === 'rejected') {
    warnings.push('Notion store data is unavailable right now.');
  }
  if (vendorDayResult.status === 'rejected') {
    warnings.push('Vendor Day updates are unavailable right now.');
  }
  if (retailerResult.status === 'rejected' || inventoryResult.status === 'rejected' || orderResult.status === 'rejected') {
    warnings.push('Some Nabis live data is unavailable right now.');
  }

  const notionResponse = notionStoresResult.status === 'fulfilled' ? notionStoresResult.value : { stores: [] as TerritoryStorePin[] };
  const vendorDays = vendorDayResult.status === 'fulfilled' ? buildVendorDayUpcoming(vendorDayResult.value) : [];
  const retailers = retailerResult.status === 'fulfilled' ? retailerResult.value : [];
  const inventories = inventoryResult.status === 'fulfilled' ? inventoryResult.value : [];
  const orders = orderResult.status === 'fulfilled' ? orderResult.value : [];

  const notionStores = notionResponse.stores;

  const storeByLicense = new Map<string, string>();
  const storeByName = new Map<string, string>();
  const storeByNameCity = new Map<string, string>();
  const retailerStoreById = new Map<string, string>();
  const customerStoreIds = new Set<string>();

  for (const store of notionStores) {
    if (!store.id) continue;

    const license = normalizeLicense(String(store.licenseNumber ?? ''));
    if (license) {
      storeByLicense.set(license, store.id);
    }

    const normalizedStoreName = normalizeLookupValue(store.name);
    if (normalizedStoreName) {
      if (!storeByName.has(normalizedStoreName)) {
        storeByName.set(normalizedStoreName, store.id);
      }
    }

    const normalizedStoreCity = normalizeLookupValue(String(store.city ?? ''));
    const nameCityKey = `${normalizedStoreName}|${normalizedStoreCity}`.trim();
    if (normalizedStoreName && normalizedStoreCity) {
      if (!storeByNameCity.has(nameCityKey)) {
        storeByNameCity.set(nameCityKey, store.id);
      }
    }
  }

  const retailerById = new Map<string, NabisRetailerRaw>();
  for (const retailer of retailers) {
    const retailerId = toSafeString(retailer.id);
    if (!retailerId) continue;

    retailerById.set(retailerId, retailer);

    const retailerName = normalizeLookupValue(String(retailer.doingBusinessAs || retailer.name || ''));
    if (!retailerName) continue;

    const byName = storeByName.get(retailerName);
    const byNameCity = storeByNameCity.get(
      `${retailerName}|${normalizeLookupValue(String(retailer.city || ''))}`.trim(),
    );
    const retailerStoreId = byName || byNameCity || null;

    if (retailerStoreId) {
      retailerStoreById.set(retailerId, retailerStoreId);
      customerStoreIds.add(retailerStoreId);
    }
  }

  const storeBrandsById = new Map<string, Set<string>>();
  const storeProductsById = new Map<string, Set<string>>();
  const skuBrandBySkuCode = new Map<string, string>();

  for (const rawOrder of orders) {
    const status = toSafeUpper(rawOrder.status);
    if (status && CANCELED_ORDER_STATUSES.has(status)) {
      continue;
    }

    const action = toSafeUpper(rawOrder.orderAction);
    if (action && INTERNAL_TRANSFER_ACTIONS.has(action)) {
      continue;
    }

    const retailerId = toSafeString(rawOrder.retailerId);
    const order = {
      retailerId,
      retailerName: toSafeString(rawOrder.retailer),
      siteLicenseNumber: toSafeString(rawOrder.siteLicenseNumber),
      skuCode: toSafeString(rawOrder.skuCode),
      brandName: toSafeString(rawOrder.brandName),
      orgBrand: toSafeString(rawOrder.organization),
      productName: toSafeString(rawOrder.skuDisplayName || rawOrder.skuName),
      siteCity: toSafeString(rawOrder.siteCity),
    };

    const retailer = retailerId ? retailerById.get(retailerId) : undefined;
    const storeId = resolveStoreMatch({
      orderRetailerId: retailerId,
      orderRetailerName: order.retailerName || toSafeString(retailer?.name) || null,
      orderCity: order.siteCity,
      orderLicense: order.siteLicenseNumber,
      retailerStoreById,
      storeByLicense,
      storeByName,
      storeByNameCity,
    });

    if (!storeId) {
      continue;
    }

    customerStoreIds.add(storeId);
    const brandName = order.brandName || order.orgBrand;

    if (order.skuCode && brandName) {
      skuBrandBySkuCode.set(order.skuCode, brandName);
    }

    if (brandName) {
      const brands = storeBrandsById.get(storeId) || new Set<string>();
      brands.add(brandName);
      storeBrandsById.set(storeId, brands);
    }

    if (order.productName) {
      const products = storeProductsById.get(storeId) || new Set<string>();
      products.add(order.productName);
      storeProductsById.set(storeId, products);
    }
  }

  const stores: PublicStore[] = notionStores.map((store) => {
    const brands = [...(storeBrandsById.get(store.id) || [])].sort((a, b) => a.localeCompare(b));
    const products = [...(storeProductsById.get(store.id) || [])].sort((a, b) => a.localeCompare(b));

    return {
      id: store.id,
      notionPageId: store.notionPageId,
      name: store.name,
      licenseNumber: toSafeString(store.licenseNumber),
      city: toSafeString(store.city),
      state: toSafeString(store.state),
      address: store.locationAddress || null,
      status: store.status,
      phoneNumber: toSafeString(store.phoneNumber),
      email: toSafeString(store.email),
      isPreferredPartner: Boolean(store.isPreferredPartner),
      isCustomer: customerStoreIds.has(store.id),
      latitude: store.lat,
      longitude: store.lng,
      brands,
      products,
    };
  });

  const menuBySku = inventories.reduce<Map<string, PublicMenuItem>>((accumulator, rawItem) => {
    const menuItem = sanitizeMenuItem(rawItem);
    if (!menuItem) return accumulator;

    const existing = accumulator.get(menuItem.skuCode);
    const brand = menuItem.brand || skuBrandBySkuCode.get(menuItem.skuCode) || null;

    if (!existing) {
      accumulator.set(menuItem.skuCode, {
        ...menuItem,
        brand,
        description: menuItem.description,
      });
      return accumulator;
    }

    accumulator.set(menuItem.skuCode, {
      ...existing,
      availableQuantity: existing.availableQuantity + menuItem.availableQuantity,
      pricePerUnit: existing.pricePerUnit || menuItem.pricePerUnit,
      description: existing.description || menuItem.description,
      brand: existing.brand || brand,
    });

    return accumulator;
  }, new Map());

  const menuItems = Array.from(menuBySku.values())
    .filter((item): item is PublicMenuItem => item !== null && item.productName.length > 0)
    .sort((a, b) => b.availableQuantity - a.availableQuantity || a.productName.localeCompare(b.productName))
    .slice(0, 300);

  const brandOptions = new Set<string>();
  const productOptions = new Set<string>();
  for (const item of menuItems) {
    if (item.brand) {
      brandOptions.add(item.brand);
    }
    productOptions.add(item.productName);
  }
  for (const store of stores) {
    for (const brand of store.brands) {
      brandOptions.add(brand);
    }
  }
  for (const store of stores) {
    for (const product of store.products) {
      productOptions.add(product);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    warnings,
    stores,
    menuItems,
    vendorDays,
    brandOptions: [...brandOptions].sort((a, b) => a.localeCompare(b)),
    productOptions: [...productOptions].sort((a, b) => a.localeCompare(b)),
  };
}

function toSafeUpper(value: unknown) {
  return toSafeString(value)?.toUpperCase() ?? null;
}
