'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { BarChart3, CalendarDays, House, LogOut, MapPinned, Route, Settings, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppAccessProvider, type AppAccessState } from '@/components/auth/app-access-provider';
import { InteractionTracker } from '@/components/layout/interaction-tracker';
import { RoleSwitcher } from '@/components/layout/role-switcher';
import { cn } from '@/lib/utils';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import { RoleDisplayNames } from '@/lib/types/rbac';

const CommandPalette = dynamic(
  () => import('@/components/crm/command-palette').then((mod) => mod.CommandPalette),
  { ssr: false, loading: () => null },
);

type NavTab = {
  href: string;
  matchHref?: string;
  label: string;
  icon: typeof House;
};

const defaultTabs: NavTab[] = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/territory', label: 'Map', icon: MapPinned },
  { href: '/accounts', label: 'Accounts', icon: UserRound },
  { href: '/route', label: 'Route', icon: Route },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

const brandAmbassadorTabs: NavTab[] = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/vendor-days?view=today', matchHref: '/vendor-days', label: 'Vendor Days', icon: CalendarDays },
  { href: '/territory', label: 'Map', icon: MapPinned },
  { href: '/accounts', label: 'Accounts', icon: UserRound },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function roleLabel(role: AppAccessState['role']) {
  return RoleDisplayNames[role];
}

export function AppShell({
  children,
  access,
}: {
  children: React.ReactNode;
  access: AppAccessState;
}) {
  const pathname = usePathname();
  const isTerritoryRoute = pathname === '/territory' || pathname.startsWith('/territory/');
  const routePlan = useRoutePlan();
  const { signOut } = useClerk();
  const [commandMounted, setCommandMounted] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const tabs = access.role === 'BRAND_AMBASSADOR' ? brandAmbassadorTabs : defaultTabs;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandMounted(true);
        setCommandOpen((previous) => !previous);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <AppAccessProvider value={access}>
      <InteractionTracker />
      <div className="h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.55),transparent_34%),linear-gradient(180deg,#d7d8dc_0%,#c9cacf_100%)] px-0 md:px-3 lg:px-5">
        {commandMounted ? <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} /> : null}
        <div className="mx-auto flex h-[100dvh] max-w-[var(--app-shell-max)] flex-col overflow-hidden bg-[#e6e6e9] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] md:h-[calc(100dvh-24px)] md:rounded-[28px] md:shadow-[0_20px_60px_rgba(31,35,43,0.18)]">
          <header className="sticky top-0 z-[3000] flex items-center justify-between gap-3 border-b border-[#d7dde7] bg-[linear-gradient(180deg,rgba(249,251,255,0.96)_0%,rgba(241,245,250,0.94)_100%)] px-3 py-2 text-[#1f232b] backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-[#d7dde7] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(31,35,43,0.06)]">
                <p className="text-[13px] font-semibold tracking-[0.01em] text-[#18212d]">PiCC New York</p>
              </div>
              <RoleSwitcher activeRole={access.role} availableRoles={access.availableRoles} />
              {access.testModeEnabled ? (
                <span className="rounded-full border border-[#d9a696] bg-[#fff2ec] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b33a1d]">
                  Test Mode
                </span>
              ) : null}
              {access.isGuestViewer ? (
                <span className="rounded-full border border-[#b7c3dc] bg-[#edf3ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3559a9]">
                  Read Only
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <details className="relative">
                <summary className="flex list-none cursor-pointer items-center gap-1 rounded-md border border-[#c5c8ce] bg-white px-2 py-1 text-[11px] font-semibold text-[#2f3640]">
                  Profile
                </summary>
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[170px] rounded-xl border border-[#d3d9e2] bg-white p-1.5 shadow-[0_18px_45px_rgba(31,35,43,0.18)]">
                  <div className="rounded-lg px-3 py-2 text-[11px] font-medium text-[#5c6674]">
                    Current Role
                    <div className="mt-1 text-sm font-semibold text-[#18212d]">{roleLabel(access.role)}</div>
                  </div>
                  <Link href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#243040] hover:bg-[#f3f6fb]">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#243040] hover:bg-[#f3f6fb]"
                    onClick={() => {
                      void signOut({ redirectUrl: '/sign-in' });
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </details>
            </div>
          </header>
          <main className={cn('min-h-0 flex-1', isTerritoryRoute ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-[84px]')}>
            {children}
          </main>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-[4000] text-white" aria-label="Primary navigation">
          <div className="mx-auto grid h-[84px] max-w-[var(--app-shell-max)] grid-cols-5 border-t border-[#243041] bg-[linear-gradient(180deg,#1f2631_0%,#171d26_100%)] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 md:mb-3 md:rounded-[22px] md:border md:shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
            {tabs.map((item) => {
              const active = isActive(pathname, item.matchHref ?? item.href);
              const Icon = item.icon;
              const showBadge = item.href === '/route' && routePlan.selectedCount > 0;

              return (
                <Link key={item.href} href={item.href} className="relative flex min-h-[40px] flex-col items-center justify-center gap-1" aria-current={active ? 'page' : undefined}>
                  <div className={cn('relative rounded-full p-1.5', active ? 'text-white' : 'text-[#7f8691]')}>
                    <Icon className="h-6 w-6" strokeWidth={2.2} />
                    {showBadge ? (
                      <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ff4d4f] px-1 text-[11px] font-bold leading-none text-white">
                        {Math.min(99, routePlan.selectedCount)}
                      </span>
                    ) : null}
                  </div>
                  <span className={cn('text-[11px] font-medium', active ? 'text-white' : 'text-[#8f949e]')}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </AppAccessProvider>
  );
}
