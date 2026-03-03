'use client';

import dynamic from 'next/dynamic';
import { MapRenderBoundary } from '@/components/mobile/map-render-boundary';
import type { TerritoryStorePin } from '@/lib/territory/types';

const TerritoryMapCanvasInner = dynamic(() => import('@/components/territory/map-canvas-inner').then((mod) => mod.TerritoryMapCanvasInner), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-200" />,
});

interface MapCanvasProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  routeCoordinates: [number, number][];
  focusedStoreId: string | null;
  onSelectStore: (storeId: string | null) => void;
}

export function MapCanvas(props: MapCanvasProps) {
  return (
    <MapRenderBoundary>
      <TerritoryMapCanvasInner {...props} />
    </MapRenderBoundary>
  );
}
