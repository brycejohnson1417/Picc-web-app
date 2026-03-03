'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, MapPinned, Route, Settings, UserRound } from 'lucide-react';
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
    <div className="min-h-screen bg-[#cfd0d4]">
      {commandMounted ? <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} /> : null}
      <div className="mx-auto min-h-screen max-w-[480px] bg-[#e6e6e9] shadow-[0_0_0_1px_rgba(0,0,0,0.12)]">
        <main className="pb-[92px]">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-[4000] bg-[#1f232b] text-white">
        <div className="mx-auto grid h-[92px] max-w-[480px] grid-cols-5 border-t border-[#2f3540] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
          {tabs.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const showBadge = item.href === '/route' && routePlan.selectedCount > 0;

            return (
              <Link key={item.href} href={item.href} className="relative flex flex-col items-center justify-center gap-1">
                <div className={cn('relative rounded-full p-1.5', active ? 'text-white' : 'text-[#7f8691]')}>
                  <Icon className="h-7 w-7" strokeWidth={2.2} />
                  {showBadge ? (
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ff4d4f] px-1 text-[11px] font-bold leading-none text-white">
                      {Math.min(99, routePlan.selectedCount)}
                    </span>
                  ) : null}
                </div>
                <span className={cn('text-[12px] font-medium', active ? 'text-white' : 'text-[#8f949e]')}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
