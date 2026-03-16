import type { TerritoryStorePin } from '@/lib/territory/types';

export type PinColorMode = 'status' | 'rep';

const DISTINCT_REP_COLORS = [
  '#e11d48',
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#c026d3',
  '#65a30d',
  '#dc2626',
  '#1d4ed8',
  '#0f766e',
  '#ea580c',
  '#9333ea',
  '#0d9488',
  '#db2777',
  '#4f46e5',
  '#15803d',
  '#b45309',
  '#7e22ce',
  '#0369a1',
  '#be123c',
  '#4338ca',
  '#059669',
  '#a16207',
];

function normalizeRepLabel(label: string) {
  return label.trim();
}

export function repColorForLabel(label: string) {
  const normalized = normalizeRepLabel(label);
  if (!normalized) {
    return '#64748b';
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
  uniqueLabels.forEach((label, index) => {
    map.set(label, label === 'Unassigned' ? '#64748b' : DISTINCT_REP_COLORS[index % DISTINCT_REP_COLORS.length]);
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
