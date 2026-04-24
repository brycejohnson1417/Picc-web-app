export type PreferredPartnerPrice = {
  brand: string;
  size: string;
  weight: string;
  displayBrand: string;
  standardWholesale: number;
  preferredWholesale: number;
};

export const PREFERRED_PARTNER_PRICING: PreferredPartnerPrice[] = [
  { brand: 'Chopsticks', displayBrand: 'Chopsticks 2-Pk', size: '2 (.5g)', weight: '1g', standardWholesale: 5, preferredWholesale: 4 },
  { brand: 'Ichi-Roll', displayBrand: 'Ichi Single', size: 'Single', weight: '1g', standardWholesale: 5, preferredWholesale: 4 },
  { brand: 'Ichi-Roll', displayBrand: 'Ichi Pack', size: '4-Pack', weight: '4g', standardWholesale: 16, preferredWholesale: 12.8 },
  { brand: '#Juan-Roll', displayBrand: '#Juan Single', size: 'Single', weight: '1g', standardWholesale: 5, preferredWholesale: 4 },
  { brand: '#Juan-Roll', displayBrand: '#Juan Pack', size: '4-Pack', weight: '4g', standardWholesale: 16, preferredWholesale: 12.8 },
  { brand: 'Smack.', displayBrand: 'Smack Mini Single', size: 'Mini', weight: '0.5g', standardWholesale: 4.25, preferredWholesale: 3.4 },
  { brand: 'Smack.', displayBrand: 'Smack Single', size: 'Single', weight: '1g', standardWholesale: 6.25, preferredWholesale: 5 },
  { brand: 'O-Yeah', displayBrand: 'O-Yeah Single', size: 'Single', weight: '1g', standardWholesale: 7.5, preferredWholesale: 6 },
  { brand: 'O-Yeah', displayBrand: 'O-Yeah Pack', size: '5-Pack', weight: '2.5g', standardWholesale: 17.5, preferredWholesale: 14 },
  { brand: 'State of Mind', displayBrand: 'State of Mind Single', size: 'Single', weight: '1g', standardWholesale: 10, preferredWholesale: 8 },
  { brand: 'State of Mind', displayBrand: 'State of Mind Pack', size: '5-Pack', weight: '2.5g', standardWholesale: 25, preferredWholesale: 20 },
  { brand: 'Sushi Hash', displayBrand: 'Sushi Hash Single', size: 'Single', weight: '1g', standardWholesale: 12.5, preferredWholesale: 10 },
  { brand: 'Sushi Hash', displayBrand: 'Sushi Hash Pack', size: '5-Pack', weight: '2.5g', standardWholesale: 32.5, preferredWholesale: 26 },
];

const BRAND_ALIASES: Record<string, string[]> = {
  Chopsticks: ['chopsticks'],
  'Ichi-Roll': ['ichi roll', 'ichiroll'],
  '#Juan-Roll': ['juan roll', 'juanroll', '#juan roll', '#juanroll'],
  'Smack.': ['smack'],
  'O-Yeah': ['o yeah', 'oyeah'],
  'State of Mind': ['state of mind', 'stateofmind', 'som'],
  'Sushi Hash': ['sushi hash', 'sushihash'],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9#.\s-]/g, ' ')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: string) {
  return normalizeText(value).replace(/\s+/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectSizes(text: string) {
  const raw = text.toLowerCase();
  const normalized = normalizeText(text);
  const compact = compactText(text);
  const sizes = new Set<string>();

  if (/\b(5\s*pack|5\s*pk|five\s*pack|5\s*ct)\b/.test(normalized) || compact.includes('5pack') || compact.includes('5pk')) {
    sizes.add('5-Pack');
  }
  if (/\b(4\s*pack|4\s*pk|four\s*pack|4\s*ct)\b/.test(normalized) || compact.includes('4pack') || compact.includes('4pk')) {
    sizes.add('4-Pack');
  }
  if (/\b(chopsticks|2\s*0\.5g|2\s*\.5g|2\s*x\s*\.5g|two\s*pack)\b/.test(normalized)) {
    sizes.add('2 (.5g)');
  }
  if (sizes.size > 0) {
    return sizes;
  }

  if (/\b(mini|0\.5g|\.5g|half\s*gram)\b/.test(raw) || /\b(mini|0\.5g|5g|half\s*gram)\b/.test(normalized)) {
    sizes.add('Mini');
    return sizes;
  }
  if (/\b(single|1g|1\s*gram)\b/.test(normalized)) {
    sizes.add('Single');
  }

  return sizes;
}

function detectWeights(text: string) {
  const raw = text.toLowerCase();
  const compact = compactText(text);
  const weights = new Set<string>();

  if (/(^|[^0-9])25g/.test(compact) || compact.includes('2.5g') || raw.includes('2.5g')) weights.add('2.5g');
  if (/(^|[^0-9])05g/.test(compact) || compact.includes('0.5g') || compact.includes('.5g') || raw.includes('0.5g') || raw.includes('.5g')) {
    weights.add('0.5g');
  }
  if (/(^|[^0-9])4g/.test(compact)) weights.add('4g');
  if (/(^|[^0-9])1g/.test(compact) || raw.includes('1g')) weights.add('1g');

  return weights;
}

function brandMatches(text: string, brand: string) {
  const normalized = normalizeText(text);
  const compact = compactText(text);
  return (BRAND_ALIASES[brand] ?? [brand]).some((alias) => {
    const normalizedAlias = normalizeText(alias);
    if (normalizedAlias.length <= 3) {
      return new RegExp(`\\b${escapeRegExp(normalizedAlias)}\\b`).test(normalized);
    }
    return normalized.includes(normalizedAlias) || compact.includes(normalizedAlias.replace(/\s+/g, ''));
  });
}

export function preferredPartnerPriceKey(price: PreferredPartnerPrice) {
  return `${price.brand}|${price.size}|${price.weight}`;
}

export function matchPreferredPartnerPrice(input: {
  productName?: string | null;
  skuName?: string | null;
  skuDisplayName?: string | null;
  skuCode?: string | null;
  unitDescription?: string | null;
}) {
  const text = [input.productName, input.skuName, input.skuDisplayName, input.skuCode, input.unitDescription]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ');

  if (!text) {
    return null;
  }

  const brandCandidates = PREFERRED_PARTNER_PRICING.filter((row) => brandMatches(text, row.brand));
  if (brandCandidates.length === 0) {
    return null;
  }
  if (brandCandidates.length === 1) {
    return brandCandidates[0];
  }

  const sizes = detectSizes(text);
  const sizeMatches = brandCandidates.filter((row) => sizes.has(row.size));
  if (sizeMatches.length === 1) {
    return sizeMatches[0];
  }

  const weights = detectWeights(text);
  const weightMatches = (sizeMatches.length > 0 ? sizeMatches : brandCandidates).filter((row) => weights.has(row.weight));
  if (weightMatches.length === 1) {
    return weightMatches[0];
  }

  return sizeMatches[0] ?? weightMatches[0] ?? null;
}
