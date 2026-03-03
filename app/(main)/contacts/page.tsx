import { ContactsTable } from '@/components/crm/contacts-table';
import { loadLiveNotionContacts } from '@/lib/server/notion-live-crm';
import { QueryToast } from '@/components/crm/query-toast';

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ new?: string; export?: string }> }) {
  const rows = await loadLiveNotionContacts();
  const params = await searchParams;

  return (
    <div className="space-y-6">
      {params.new === '1' && <QueryToast message="Create New Contact form coming soon" />}
      {params.export === '1' && <QueryToast message="Contact export initiated" type="success" />}
      <header>
        <h1 className="text-3xl font-bold">Contacts</h1>
        <p className="text-sm text-slate-500">High-turnover contact table. Mark inactive instantly while preserving account history.</p>
      </header>
      <ContactsTable rows={rows} />
    </div>
  );
}
