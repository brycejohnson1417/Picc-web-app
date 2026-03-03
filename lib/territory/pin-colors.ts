import type { TerritoryStorePin } from '@/lib/territory/types';

export type PinColorMode = 'status' | 'rep';

const REP_PALETTE = [
  '#0ea5e9',
  '#6366f1',
  '#14b8a6',
  '#f97316',
  '#e11d48',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
];

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function repColorForLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return '#64748b';
  }
  return REP_PALETTE[hashString(normalized) % REP_PALETTE.length];
}

export function pinColorForStore(store: TerritoryStorePin, mode: PinColorMode) {
  if (mode === 'rep') {
    const rep = store.repNames.find((name) => name.trim().length > 0) ?? 'Unassigned';
    return repColorForLabel(rep);
  }
  return store.statusColor;
}
