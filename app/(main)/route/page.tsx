import { RouteDesktop } from '@/components/route/route-desktop';
import { RouteMobile } from '@/components/mobile/route-mobile';

export const dynamic = 'force-dynamic';

export default function RoutePage() {
  return (
    <>
      <div className="md:hidden">
        <RouteMobile />
      </div>
      <div className="hidden md:block">
        <div className="space-y-6">
          <header>
            <h1 className="text-3xl font-bold">Route Planner</h1>
            <p className="text-sm text-slate-500">Plan desktop routes with optimized ordering, map launch, and saved route support.</p>
          </header>
          <RouteDesktop />
        </div>
      </div>
    </>
  );
}
