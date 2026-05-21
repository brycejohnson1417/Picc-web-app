import type { TerritoryStorePin } from '@/lib/territory/types';

const DEFAULT_SUGGESTION_LIMIT = 8;

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function searchableText(store: TerritoryStorePin) {
  return [
    store.name,
    store.locationAddress ?? '',
    store.locationLabel ?? '',
    store.city ?? '',
    store.state ?? '',
    store.licenseNumber ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreStoreMatch(store: TerritoryStorePin, query: string) {
  const name = store.name.toLowerCase();
  const haystack = searchableText(store);

  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (haystack.includes(query)) return 3;
  return null;
}

export function getTerritoryMapSearchSuggestions(
  query: string,
  stores: TerritoryStorePin[],
  limit = DEFAULT_SUGGESTION_LIMIT,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  return stores
    .map((store) => ({ store, score: scoreStoreMatch(store, normalizedQuery) }))
    .filter((entry): entry is { store: TerritoryStorePin; score: number } => entry.score !== null)
    .sort((left, right) => {
      const scoreDiff = left.score - right.score;
      if (scoreDiff !== 0) return scoreDiff;
      return left.store.name.localeCompare(right.store.name);
    })
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.store);
}
