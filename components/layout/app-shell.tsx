'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { CalendarDays, LogOut, MapPinned, Route, Settings, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRoutePlan } from '@/lib/territory/route-plan-client';

const CommandPalette = dynamic(
  () => import('@/components/crm/command-palette').then((mod) => mod.CommandPalette),
  { ssr: false, loading: () => null },
);

const tabs = [
  { href: '/territory', label: 'Map', icon: MapPinned },
  { href: '/accounts', label: 'Accounts', icon: UserRound },
  { href: '/route', label: 'Route', icon: Route },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === '/territory') {
    return pathname === '/territory' || pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routePlan = useRoutePlan();
  const { signOut } = useClerk();
  const [commandMounted, setCommandMounted] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

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
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.55),transparent_34%),linear-gradient(180deg,#d7d8dc_0%,#c9cacf_100%)] px-0 md:px-3 lg:px-5">
      {commandMounted ? <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} /> : null}
      <div className="mx-auto min-h-[100dvh] max-w-[var(--app-shell-max)] bg-[#e6e6e9] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] md:min-h-[calc(100dvh-24px)] md:overflow-hidden md:rounded-[28px] md:shadow-[0_20px_60px_rgba(31,35,43,0.18)]">
        <header className="flex items-center justify-between border-b border-[#c8c9ce] bg-[#f0f1f4] px-3 py-1.5 text-[#1f232b]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">piccnewyork.org</p>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-[#c5c8ce] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#2f3640]"
            onClick={() => {
              void signOut({ redirectUrl: '/sign-in' });
            }}
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </header>
        <main className="pb-[84px]">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-[4000] text-white" aria-label="Primary navigation">
        <div className="mx-auto grid h-[84px] max-w-[var(--app-shell-max)] grid-cols-5 border-t border-[#2f3540] bg-[#1f232b] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 md:mb-3 md:rounded-[22px] md:border md:shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
          {tabs.map((item) => {
            const active = isActive(pathname, item.href);
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
  );
}
