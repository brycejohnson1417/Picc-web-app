'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { BarChart3, CalendarDays, ContactRound, House, LogOut, MapPinned, Route, Search, Settings, UserRound } from 'lucide-react';
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
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

function isActive(pathname: string, href: string) {
  if (href === '/accounts' && (pathname === '/contacts' || pathname.startsWith('/contacts/'))) {
    return true;
  }
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
  const [commandMounted, setCommandMounted] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const tabs = defaultTabs;

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

  const desktopTabs: NavTab[] = [
    { href: '/territory', label: 'Map', icon: MapPinned },
    { href: '/accounts', label: 'Accounts', icon: UserRound },
    { href: '/contacts', label: 'Contacts', icon: ContactRound },
    { href: '/route', label: 'Routes', icon: Route },
    { href: '/calendar', label: 'Follow-ups', icon: CalendarDays },
    { href: '/home', label: 'Today', icon: House },
    { href: '/reports', label: 'Reports', icon: BarChart3 },
  ];

  const openSearch = () => { setCommandMounted(true); setCommandOpen(true); };

  return (
    <AppAccessProvider value={access}>
      <InteractionTracker />
      {commandMounted ? <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} /> : null}
      <div className="picc-app-shell flex h-[100dvh] overflow-hidden bg-[#f7f7f5]">
        <aside className="picc-desktop-nav hidden w-[152px] shrink-0 flex-col bg-[#242624] text-[#d8dcd7] lg:flex">
          <Link href="/territory" className="flex h-[72px] items-center gap-2 px-5" aria-label="PICC New York map">
            <span className="text-[28px] font-black tracking-[-1.4px] text-[#fafbf8]">PICC<span className="text-[#ef5636]">.</span></span>
            <span className="mt-1 text-[10px] font-medium leading-[1.2] text-[#a4aca2]">NEW<br />YORK</span>
          </Link>
          <button type="button" onClick={openSearch} className="mx-3 mb-5 flex h-9 items-center gap-2 rounded-md border border-[#454943] px-2.5 text-[12px] text-[#b9c0b6] hover:border-[#737b6f] hover:text-white">
            <Search className="h-3.5 w-3.5" /> Search <kbd className="ml-auto text-[10px]">⌘K</kbd>
          </button>
          <nav aria-label="Primary navigation" className="space-y-1 px-2.5">
            {desktopTabs.map((item) => {
              const active = item.href === '/accounts' ? pathname === '/accounts' : isActive(pathname, item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                className={cn('flex h-[42px] items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors', active ? 'bg-[#454a42] text-[#fafbf8]' : 'hover:bg-[#343833] hover:text-[#fafbf8]')}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                {item.label}
                {item.href === '/route' && routePlan.selectedCount > 0 ? <span className="ml-auto rounded bg-[#626d5b] px-1.5 py-0.5 text-[10px] tabular-nums text-white">{routePlan.selectedCount}</span> : null}
              </Link>;
            })}
          </nav>
          <div className="mt-auto border-t border-[#3e433c] px-3 py-4">
            <Link href="/settings" className="flex h-10 items-center gap-3 rounded-md px-2 text-[13px] hover:bg-[#343833]"><Settings className="h-[18px] w-[18px]" />Settings</Link>
            <details className="relative mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 hover:bg-[#343833]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e9ede4] text-[10px] font-bold text-[#394333]">P</span>
                <span className="min-w-0 text-[11px]"><span className="block text-[#e0e5db]">PICC workspace</span><span className="text-[#9aa493]">{access.isGuestViewer ? 'Read only' : access.testModeEnabled ? 'Test Mode' : roleLabel(access.role)}</span></span>
              </summary>
              <div className="absolute bottom-[calc(100%+8px)] left-0 z-[6000] w-56 rounded-lg border border-[#dfe4d7] bg-[#fbfcf9] p-2 text-[#30392a] shadow-xl">
                <div className="px-3 py-2"><RoleSwitcher activeRole={access.role} availableRoles={access.availableRoles} /></div>
                <SignOutAction />
              </div>
            </details>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-[3000] flex h-12 shrink-0 items-center justify-between border-b border-[#e2e5df] bg-[#fbfcf9] px-4 lg:hidden">
            <Link href="/territory" className="text-[18px] font-black tracking-tight text-[#292d27]">PICC<span className="text-[#c93412]">.</span></Link>
            <div className="flex items-center gap-2">
              <RoleSwitcher activeRole={access.role} availableRoles={access.availableRoles} />
              {access.testModeEnabled ? <span className="text-[10px] font-semibold text-[#b33a1d]">Test Mode</span> : null}
              {access.isGuestViewer ? <span className="text-[10px] font-semibold text-[#3559a9]">Read only</span> : null}
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-[12px] text-[#596251]">Profile</summary>
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[180px] rounded-lg border bg-white p-2 shadow-lg">
                  <Link href="/settings" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"><Settings className="h-4 w-4" />Settings</Link>
                  <SignOutAction />
                </div>
              </details>
            </div>
          </header>
          <main className={cn('relative min-h-0 flex-1', isTerritoryRoute ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-[var(--picc-bottom-nav-height)]')}>
            {children}
          </main>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-[4000] border-t border-[#3b4238] bg-[#242624] text-white lg:hidden" aria-label="Mobile navigation">
          <div className="grid h-[var(--picc-bottom-nav-height)] grid-cols-5 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1">
            {tabs.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className="relative flex min-h-11 flex-col items-center justify-center gap-1">
                <span className={cn('relative rounded-md px-3 py-1', active ? 'bg-[#454a42] text-white' : 'text-[#a0a99a]')}><Icon className="h-5 w-5" />
                  {item.href === '/route' && routePlan.selectedCount > 0 ? <span className="absolute -right-0.5 -top-1 rounded-full bg-[#d74121] px-1.5 text-[10px] text-white">{routePlan.selectedCount}</span> : null}
                </span><span className={cn('text-[10px]',active ? 'text-white' : 'text-[#a0a99a]')}>{item.label}</span>
              </Link>;
            })}
          </div>
        </nav>
      </div>
    </AppAccessProvider>
  );
}

function SignOutAction() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  if (!hasClerk) {
    return (
      <button
        type="button"
        disabled
        className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#a0a7b3]"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </button>
    );
  }

  return <ClerkSignOutAction />;
}

function ClerkSignOutAction() {
  const { signOut } = useClerk();

  return (
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
  );
}
