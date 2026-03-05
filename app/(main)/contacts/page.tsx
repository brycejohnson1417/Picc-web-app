import { ContactsPageClient } from '@/components/crm/contacts-page-client';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { loadLiveNotionContacts } from '@/lib/server/notion-live-crm';

export default async function ContactsPage() {
  const { orgId } = await requireWorkspaceContext();
  const [rows, accounts] = await Promise.all([
    loadLiveNotionContacts(),
    prisma.account.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 400,
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Contacts</h1>
        <p className="text-sm text-slate-500">High-turnover contact table. Mark inactive instantly while preserving account history.</p>
      </header>
      <ContactsPageClient initialRows={rows} accounts={accounts} />
    </div>
  );
}
