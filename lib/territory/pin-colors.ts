import type { TerritoryStorePin } from '@/lib/territory/types';

export type PinColorMode = 'status' | 'rep';

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
  roxy: '#22c55e',
  'bryce johnson': '#ff1493',
  ben: '#dc2626',
  'benjamin rosenthal': '#dc2626',
  donovan: '#f97316',
  'donovan snyder': '#f97316',
  eric: '#60a5fa',
  'eric acosta': '#60a5fa',
};

function normalizeRepLabel(label: string) {
  return label.trim();
}

function normalizeRepKey(label: string) {
  return normalizeRepLabel(label).toLowerCase();
}

export function repColorForLabel(label: string) {
  const normalized = normalizeRepLabel(label);
  if (!normalized) {
    return '#64748b';
  }
  const fixed = FIXED_REP_COLORS[normalizeRepKey(normalized)];
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
    const fixed = FIXED_REP_COLORS[normalizeRepKey(label)];
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

export function pinColorForStore(store: TerritoryStorePin, mode: PinColorMode, repColorMap?: Map<string, string>) {
  if (mode === 'rep') {
    const rep = store.repNames.find((name) => name.trim().length > 0) ?? 'Unassigned';
    return repColorMap?.get(rep) ?? repColorForLabel(rep);
  }
  return store.statusColor;
}
