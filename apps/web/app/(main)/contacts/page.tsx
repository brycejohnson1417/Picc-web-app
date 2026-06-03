import { ContactsTable } from '@/components/crm/contacts-table';
import { DataFreshnessBanner } from '@/components/shared/data-freshness';
import { loadAccountContactRuntime } from '@/lib/server/account-contact-runtime';

export default async function ContactsPage() {
  const runtime = await loadAccountContactRuntime();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Contacts</h1>
        <p className="text-sm text-slate-500">High-turnover contact table. Mark inactive instantly while preserving account history.</p>
      </header>
      <section className="grid gap-3 lg:grid-cols-2" aria-label="Contact data freshness">
        <DataFreshnessBanner freshness={runtime.freshness.contacts} compact />
        <DataFreshnessBanner freshness={runtime.freshness.accounts} compact />
      </section>
      <ContactsTable rows={runtime.contacts} />
    </div>
  );
}
