import type { TerritoryStorePin } from '@/lib/territory/types';

export type PinColorMode = 'status' | 'rep' | 'follow-up-date';

export interface TerritoryPinPresentation {
  color: string;
  daysUntil: number | null;
  glyph: string;
}

const DISTINCT_REP_COLORS = [
  '#7c3aed',
  '#0891b2',
  '#c026d3',
  '#65a30d',
  '#4f46e5',
  '#0f766e',
  '#a16207',
  '#9333ea',
  '#0d9488',
  '#db2777',
  '#15803d',
  '#b45309',
  '#7e22ce',
  '#0369a1',
  '#7c3aed',
  '#be123c',
  '#4338ca',
  '#059669',
  '#ea580c',
];

const FIXED_REP_COLORS: Record<string, string> = {
  roxy: '#dc2626',
  'bryce johnson': '#60a5fa',
  bryce: '#60a5fa',
  ben: '#f97316',
  'benjamin rosenthal': '#f97316',
  donovan: '#7c3aed',
  'donovan snyder': '#7c3aed',
  eric: '#16a34a',
  'eric acosta': '#16a34a',
};

const FIXED_REP_WORD_COLORS: Record<string, string> = {
  roxy: '#dc2626',
  bryce: '#60a5fa',
  ben: '#f97316',
  benjamin: '#f97316',
  donovan: '#7c3aed',
  eric: '#16a34a',
};

const FOLLOW_UP_NO_DATE_COLOR = '#0616b7';
const FOLLOW_UP_UPCOMING_SOON_COLOR = '#a7dcff';
const FOLLOW_UP_UPCOMING_LATER_COLOR = '#5f7cff';
const FOLLOW_UP_TODAY_COLOR = '#00e63a';
const FOLLOW_UP_OVERDUE_RECENT_COLOR = '#ff7a00';
const FOLLOW_UP_OVERDUE_OLD_COLOR = '#d00000';

function normalizeRepLabel(label: string) {
  return label.trim();
}

function normalizeRepKey(label: string) {
  return normalizeRepLabel(label).toLowerCase();
}

function fixedRepColorForLabel(label: string) {
  const key = normalizeRepKey(label);
  const exact = FIXED_REP_COLORS[key];
  if (exact) {
    return exact;
  }

  const words = key.match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    const wordColor = FIXED_REP_WORD_COLORS[word];
    if (wordColor) {
      return wordColor;
    }
  }

  return null;
}

export function repColorForLabel(label: string) {
  const normalized = normalizeRepLabel(label);
  if (!normalized) {
    return '#64748b';
  }
  const fixed = fixedRepColorForLabel(normalized);
  if (fixed) {
    return fixed;
  }
  return createRepColorMap([normalized]).get(normalized) ?? '#64748b';
}

export function createRepColorMap(labels: string[]) {
  const uniqueLabels = [...new Set(labels.map(normalizeRepLabel).filter(Boolean))].sort((left, right) => {
    if (left === 'Unassigned') return 1;
    if (right === 'Unassigned') return -1;
    return left.localeCompare(right);
  });

  const map = new Map<string, string>();
  let paletteIndex = 0;
  uniqueLabels.forEach((label) => {
    if (label === 'Unassigned') {
      map.set(label, '#64748b');
      return;
    }
    const fixed = fixedRepColorForLabel(label);
    if (fixed) {
      map.set(label, fixed);
      return;
    }
    const color = DISTINCT_REP_COLORS[paletteIndex % DISTINCT_REP_COLORS.length];
    paletteIndex += 1;
    map.set(label, color);
  });
  return map;
}

function dateKeyToUtcDay(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysUntilFollowUp(followUpDate: string | null | undefined, referenceDate = new Date()) {
  const dateKey = followUpDate?.slice(0, 10);
  if (!dateKey) {
    return null;
  }

  const followUpDay = dateKeyToUtcDay(dateKey);
  const referenceDay = dateKeyToUtcDay(localDateKey(referenceDate));
  if (followUpDay === null || referenceDay === null) {
    return null;
  }

  return Math.round((followUpDay - referenceDay) / 86_400_000);
}

function followUpColorForDays(daysUntil: number | null) {
  if (daysUntil === null) {
    return FOLLOW_UP_NO_DATE_COLOR;
  }
  if (daysUntil === 0) {
    return FOLLOW_UP_TODAY_COLOR;
  }
  if (daysUntil > 0) {
    return daysUntil <= 7 ? FOLLOW_UP_UPCOMING_SOON_COLOR : FOLLOW_UP_UPCOMING_LATER_COLOR;
  }
  return Math.abs(daysUntil) <= 7 ? FOLLOW_UP_OVERDUE_RECENT_COLOR : FOLLOW_UP_OVERDUE_OLD_COLOR;
}

export function followUpPinPresentation(store: Pick<TerritoryStorePin, 'followUpDate'>, referenceDate = new Date()): TerritoryPinPresentation {
  const daysUntil = daysUntilFollowUp(store.followUpDate, referenceDate);
  return {
    color: followUpColorForDays(daysUntil),
    daysUntil,
    glyph: daysUntil === null ? '' : String(daysUntil),
  };
}

export function pinColorForStore(store: TerritoryStorePin, mode: PinColorMode, repColorMap?: Map<string, string>, referenceDate = new Date()) {
  if (mode === 'follow-up-date') {
    return followUpPinPresentation(store, referenceDate).color;
  }
  if (mode === 'rep') {
    const rep = store.repNames.find((name) => name.trim().length > 0) ?? 'Unassigned';
    return repColorMap?.get(rep) ?? repColorForLabel(rep);
  }
  return store.statusColor;
}

export function pinGlyphForStore(store: TerritoryStorePin, mode: PinColorMode, referenceDate = new Date()) {
  if (mode === 'follow-up-date') {
    return followUpPinPresentation(store, referenceDate).glyph;
  }
  if (store.isPreferredPartner) {
    return 'P';
  }
  if (store.isApproximate) {
    return '≈';
  }
  return '';
}

export function pinGlyphColorForStore(store: TerritoryStorePin, mode: PinColorMode, referenceDate = new Date()) {
  if (mode === 'follow-up-date') {
    const { daysUntil } = followUpPinPresentation(store, referenceDate);
    return daysUntil !== null && daysUntil >= 0 ? '#0f172a' : '#ffffff';
  }
  return '#ffffff';
}
