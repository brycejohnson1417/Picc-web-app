import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadAccountContactRuntime } from '@/lib/server/account-contact-runtime';
import type { PreferredPartnerFilter } from '@/lib/territory/preferred-partner';

export const dynamic = 'force-dynamic';

function readMultiParam(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const preferredPartnerParam = (searchParams.get('preferredPartner') ?? 'all').trim().toLowerCase();
  const preferredPartnerFilter: PreferredPartnerFilter =
    preferredPartnerParam === 'preferred' || preferredPartnerParam === 'not_preferred'
      ? preferredPartnerParam
      : 'all';

  try {
    const payload = await loadAccountContactRuntime({
      statuses: readMultiParam(searchParams, 'status'),
      reps: readMultiParam(searchParams, 'rep'),
      pppStatuses: readMultiParam(searchParams, 'pppStatus'),
      headsetConnectionStatuses: readMultiParam(searchParams, 'headsetConnectionStatus'),
      preferredPartnerFilter,
      referralSources: readMultiParam(searchParams, 'referralSource'),
      includeNoReferralSource: searchParams.get('noReferralSource') === '1',
      vendorDayStatuses: readMultiParam(searchParams, 'vendorDayStatus'),
      query: searchParams.get('q')?.trim() ?? '',
      refresh: searchParams.get('refresh') === '1',
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': searchParams.get('refresh') === '1'
          ? 'private, no-store, max-age=0, must-revalidate'
          : 'private, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account/contact runtime failed to load';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
