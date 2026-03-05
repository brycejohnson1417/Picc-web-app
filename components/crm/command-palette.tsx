'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { FilePlus2, Search } from 'lucide-react';

const staticItems = [
  { id: 'nav-dashboard', label: 'Go to Dashboard', href: '/dashboard', section: 'Navigation' },
  { id: 'nav-accounts', label: 'Go to Accounts', href: '/accounts', section: 'Navigation' },
  { id: 'nav-contacts', label: 'Go to Contacts', href: '/contacts', section: 'Navigation' },
  { id: 'nav-conversations', label: 'Go to Conversations', href: '/conversations', section: 'Navigation' },
  { id: 'nav-route', label: 'Go to Route Planner', href: '/route', section: 'Navigation' },
  { id: 'nav-calendar', label: 'Go to Calendar', href: '/calendar', section: 'Navigation' },
];

type CommandSearchPayload = {
  accounts: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; firstName: string; lastName: string }>;
  actions: Array<{ id: string; label: string; href: string }>;
};

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommandSearchPayload>({ accounts: [], contacts: [], actions: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults({ accounts: [], contacts: [], actions: [] });
      setLoading(false);
      return;
    }

    const q = query.trim();
    if (!q) {
      setResults({ accounts: [], contacts: [], actions: [] });
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        const response = await fetch(`/api/command/search?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          setResults({ accounts: [], contacts: [], actions: [] });
          return;
        }
        const payload = (await response.json()) as CommandSearchPayload;
        setResults(payload);
      } catch {
        if (!controller.signal.aborted) {
          setResults({ accounts: [], contacts: [], actions: [] });
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  const grouped = useMemo(() => {
    const runtimeItems = [
      ...results.actions.map((item) => ({ id: item.id, label: item.label, href: item.href, section: 'Commands' })),
      ...results.accounts.map((item) => ({ id: `account-${item.id}`, label: `Account: ${item.name}`, href: `/accounts/${item.id}`, section: 'Accounts' })),
      ...results.contacts.map((item) => ({ id: `contact-${item.id}`, label: `Contact: ${item.firstName} ${item.lastName}`, href: `/contacts/${item.id}`, section: 'Contacts' })),
    ];

    const allItems = [...staticItems, ...runtimeItems];
    return allItems.reduce<Record<string, typeof allItems>>((acc, item) => {
      if (!acc[item.section]) acc[item.section] = [];
      acc[item.section].push(item);
      return acc;
    }, {});
  }, [results]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4" onClick={() => onOpenChange(false)}>
      <Command
        className="mx-auto mt-20 w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        shouldFilter={false}
      >
        <div className="relative border-b">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            className="h-12 w-full pl-10 pr-4 text-base outline-none"
            placeholder="Search actions, records, pages..."
          />
        </div>
        <Command.List className="max-h-[60vh] overflow-auto p-2">
          <Command.Empty className="px-4 py-8 text-sm text-slate-500">No matching command.</Command.Empty>

          {loading ? <div className="px-4 py-2 text-xs text-slate-500">Searching...</div> : null}

          {Object.entries(grouped).map(([section, sectionItems]) => (
            <Command.Group key={section} heading={section} className="px-2 py-1 text-xs text-slate-500">
              {sectionItems.map((item) => (
                <Command.Item
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  onSelect={() => {
                    onOpenChange(false);
                    router.push(item.href);
                  }}
                >
                  <FilePlus2 className="h-4 w-4" />
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
