import type { TerritoryStorePin } from '@/lib/territory/types';

export type PinColorMode = 'status' | 'rep';

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

  const hash = hashString(normalized);
  const hue = hash % 360;
  const saturation = 62 + (hash % 14);
  const lightness = 46 + (Math.floor(hash / 360) % 10);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function pinColorForStore(store: TerritoryStorePin, mode: PinColorMode) {
  if (mode === 'rep') {
    const rep = store.repNames.find((name) => name.trim().length > 0) ?? 'Unassigned';
    return repColorForLabel(rep);
  }
  return store.statusColor;
}
