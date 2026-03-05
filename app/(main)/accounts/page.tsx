import { AccountsMobile } from '@/components/mobile/accounts-mobile';
import { AccountsPageClient } from '@/components/crm/accounts-page-client';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { loadLiveNotionAccounts } from '@/lib/server/notion-live-crm';

export default async function AccountsPage() {
  const { orgId } = await requireWorkspaceContext();
  const rows = await loadLiveNotionAccounts(orgId);

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
        <AccountsPageClient initialRows={rows} />
      </div>
    </>
  );
}
