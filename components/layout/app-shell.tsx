'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ChevronRight,
  Home,
  KanbanSquare,
  LayoutDashboard,
  ListTodo,
  MapPinned,
  MessageCircle,
  Route,
  Settings,
  Users,
  UserRound,
  Workflow,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRoutePlan } from '@/lib/territory/route-plan-client';

const CommandPalette = dynamic(
  () => import('@/components/crm/command-palette').then((mod) => mod.CommandPalette),
  { ssr: false, loading: () => null },
);

const mobileTabs = [
  { href: '/territory', label: 'Map', icon: MapPinned },
  { href: '/accounts', label: 'Accounts', icon: UserRound },
  { href: '/route', label: 'Route', icon: Route },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const desktopLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/territory', label: 'Territory', icon: MapPinned },
  { href: '/accounts', label: 'Accounts', icon: Home },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/conversations', label: 'Conversations', icon: MessageCircle },
  { href: '/route', label: 'Route Planning', icon: Route },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/pipelines', label: 'Pipelines', icon: KanbanSquare },
  { href: '/reports', label: 'Reports', icon: LayoutDashboard },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const mobileMoreLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/conversations', label: 'Conversations', icon: MessageCircle },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/pipelines', label: 'Pipelines', icon: KanbanSquare },
  { href: '/reports', label: 'Reports', icon: LayoutDashboard },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
];

function isRouteActive(pathname: string, href: string) {
  if (href === '/territory') {
    return pathname === '/territory' || pathname === '/';
  }

  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  if (href === '/workflows') {
    return pathname === '/workflows' || pathname.startsWith('/workflows/');
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routePlan = useRoutePlan();
  const [commandMounted, setCommandMounted] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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
    <div className="min-h-screen bg-[rgb(var(--background))]">
      {commandMounted ? <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} /> : null}

      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col dark:border-slate-800 dark:bg-slate-950">
          <div className="px-6 pb-3 pt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PICC CRM</p>
            <h1 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Command Center</h1>
          </div>
          <nav className="flex-1 space-y-1 px-3 pb-6" aria-label="Desktop navigation">
            {desktopLinks.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(pathname, item.href);
              const showBadge = item.href === '/route' && routePlan.selectedCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-[rgba(var(--primary),0.12)] text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {showBadge ? (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {Math.min(99, routePlan.selectedCount)}
                    </span>
                  ) : (
                    <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400')} />
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <main className="flex-1 px-4 pb-[84px] pt-4 md:px-8 md:pb-8 md:pt-7">{children}</main>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-[4000] bg-[#1f232b] text-white md:hidden" aria-label="Primary navigation">
        <div className="mx-auto grid h-[84px] max-w-[480px] grid-cols-6 border-t border-[#2f3540] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
          {mobileTabs.map((item) => {
            const active = isRouteActive(pathname, item.href);
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
          <button
            type="button"
            className={cn('relative flex min-h-[40px] flex-col items-center justify-center gap-1', moreOpen ? 'text-white' : 'text-[#8f949e]')}
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-menu"
          >
            <div className={cn('rounded-full p-1.5', moreOpen ? 'text-white' : 'text-[#7f8691]')}>
              <Workflow className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <span className={cn('text-[11px] font-medium', moreOpen ? 'text-white' : 'text-[#8f949e]')}>More</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-[4200] bg-black/40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            id="mobile-more-menu"
            className="absolute inset-x-3 bottom-[96px] mx-auto max-w-[474px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">More Pages</div>
            <div className="grid grid-cols-1 gap-1">
              {mobileMoreLinks.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium',
                      active
                        ? 'bg-[rgba(var(--primary),0.12)] text-slate-900 dark:text-slate-100'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
