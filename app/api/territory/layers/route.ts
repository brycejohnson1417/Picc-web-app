import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadTerritoryLayers, type TerritoryLayerMetric, type TerritoryLayerMode } from '@/lib/server/territory-read-model';

const METRICS: TerritoryLayerMetric[] = ['interactions', 'purchases', 'follow_up'];
const MODES: TerritoryLayerMode[] = ['pins', 'heatmap', 'hex'];

function readMultiParam(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const metric = (searchParams.get('metric') ?? 'interactions') as TerritoryLayerMetric;
  const mode = (searchParams.get('mode') ?? 'pins') as TerritoryLayerMode;

  if (!METRICS.includes(metric)) {
    return NextResponse.json({ error: 'Invalid metric query parameter' }, { status: 400 });
  }

  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode query parameter' }, { status: 400 });
  }

  try {
    const payload = await loadTerritoryLayers({
      metric,
      mode,
      statuses: readMultiParam(searchParams, 'status'),
      reps: readMultiParam(searchParams, 'rep'),
      query: searchParams.get('q')?.trim() ?? '',
    });

    return NextResponse.json(payload, {
      headers: {
        'X-Territory-Layer-Metric': metric,
        'X-Territory-Layer-Mode': mode,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load territory layers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
