import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { checkGoogleBudgetCap, estimateGoogleUsageCostUsd, recordGoogleUsage } from '@/lib/server/google-usage';

const GOOGLE_GEOCODING_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

type CachedGeocode = {
  lat: number;
  lng: number;
  formattedAddress: string;
};

const memoryGeocodeCache = new Map<string, CachedGeocode>();

function normalizeAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function googleGeocodingKey() {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
}

export async function geocodeAddress(input: { address: string }) {
  const normalized = normalizeAddress(input.address);
  if (!normalized) {
    throw new Error('Address is required');
  }

  const cacheKey = `search:${normalized}`;
  const memoryCached = memoryGeocodeCache.get(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }

  const cached = await prisma.spatialGeocodeCache.findUnique({
    where: { addressNormalized: cacheKey },
    select: {
      lat: true,
      lng: true,
      formattedAddress: true,
    },
  });

  if (cached) {
    const result = {
      lat: cached.lat,
      lng: cached.lng,
      formattedAddress: cached.formattedAddress ?? input.address,
    };
    memoryGeocodeCache.set(cacheKey, result);
    return result;
  }

  const key = googleGeocodingKey();
  if (!key) {
    throw new Error('Google Maps geocoding is not configured');
  }

  const budgetCheck = await checkGoogleBudgetCap(estimateGoogleUsageCostUsd('geocoding', 1));
  if (!budgetCheck.allowed) {
    throw new Error('Google geocoding budget is currently capped');
  }

  const geocodeUrl = `${GOOGLE_GEOCODING_BASE}?address=${encodeURIComponent(input.address)}&components=country:US&key=${encodeURIComponent(key)}`;

  let response: Response;
  try {
    response = await fetch(geocodeUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } finally {
    void recordGoogleUsage('geocoding', 1).catch(() => undefined);
  }

  if (!response.ok) {
    throw new Error('Address search failed');
  }

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: {
        location?: {
          lat?: number;
          lng?: number;
        };
      };
    }>;
  };

  if (payload.status !== 'OK') {
    throw new Error('Address not found');
  }

  const result = payload.results?.[0];
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) {
    throw new Error('Address not found');
  }

  const geocoded = {
    lat,
    lng,
    formattedAddress: result?.formatted_address ?? input.address,
  };

  memoryGeocodeCache.set(cacheKey, geocoded);

  await prisma.spatialGeocodeCache.upsert({
    where: { addressNormalized: cacheKey },
    create: {
      addressNormalized: cacheKey,
      lat,
      lng,
      formattedAddress: geocoded.formattedAddress,
    },
    update: {
      lat,
      lng,
      formattedAddress: geocoded.formattedAddress,
    },
  });

  return geocoded;
}
