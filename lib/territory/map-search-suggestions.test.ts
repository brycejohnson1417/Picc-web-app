import { describe, expect, it } from 'vitest';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { getTerritoryMapSearchSuggestions } from '@/lib/territory/map-search-suggestions';

function store(id: string, name: string, city = 'New York'): TerritoryStorePin {
  return {
    id,
    notionPageId: id,
    name,
    status: 'Lead - Hot',
    statusKey: 'lead-hot',
    statusColor: 'red',
    pinKind: 'lead',
    repNames: [],
    repEmails: [],
    lat: 40.75,
    lng: -73.98,
    locationLabel: city,
    locationAddress: `${city}, NY`,
    locationSource: 'google-address-cache',
    locationPrecision: 'address',
    isApproximate: false,
    lastEditedTime: '2026-05-21T00:00:00.000Z',
    city,
    state: 'NY',
    referralSource: null,
  };
}

describe('getTerritoryMapSearchSuggestions', () => {
  it('returns multiple store-name matches instead of collapsing to the first alphabetical match', () => {
    const suggestions = getTerritoryMapSearchSuggestions('Flynnstoned', [
      store('astoria', 'Flynnstoned Astoria', 'Astoria'),
      store('bay-ridge', 'Flynnstoned Bay Ridge', 'Brooklyn'),
      store('binghamton', 'Flynnstoned Binghamton', 'Binghamton'),
      store('union-square', 'Union Square Travel Agency', 'New York'),
    ]);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(['astoria', 'bay-ridge', 'binghamton']);
    expect(suggestions).toHaveLength(3);
  });
});
