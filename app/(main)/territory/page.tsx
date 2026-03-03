import { AlertTriangle } from 'lucide-react';
import { TerritoryMobile } from '@/components/mobile/territory-mobile';
import { TerritoryClient } from '@/components/territory/territory-client';
import { checkTerritoryAccess } from '@/lib/auth/territory-access';

export const dynamic = 'force-dynamic';

export default async function TerritoryPage() {
  const access = await checkTerritoryAccess();

  if (!access.ok) {
    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
        <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" />
          Territory Access Blocked
        </div>
        <p className="text-sm">{access.error ?? 'You are not allowed to access the territory view.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <TerritoryMobile />
      </div>
      <div className="hidden md:block">
        <TerritoryClient />
      </div>
    </>
  );
}
