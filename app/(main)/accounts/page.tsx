import { AccountsMobile } from '@/components/mobile/accounts-mobile';
import { AccountsTable } from '@/components/crm/accounts-table';
import { loadLiveNotionAccounts } from '@/lib/server/notion-live-crm';

export default async function AccountsPage() {
  const rows = await loadLiveNotionAccounts();

  return (
    <>
      <div className="md:hidden">
        <AccountsMobile />
      </div>
      <div className="hidden space-y-6 md:block">
        <header>
          <h1 className="text-3xl font-bold">Accounts</h1>
          <p className="text-sm text-slate-500">Primary dispensary table with filters, saved views, bulk tools, and export.</p>
        </header>
        <AccountsTable rows={rows} />
      </div>
    </>
  );
}
