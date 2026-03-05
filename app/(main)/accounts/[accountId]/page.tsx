import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { notFound } from 'next/navigation';
import { AccountHero } from '@/components/crm/account-hero';
import { ActivityTimeline } from '@/components/crm/activity-timeline';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { getAccountDetail } from '@/lib/data/accounts';
import { loadTerritoryStoreDetail } from '@/lib/server/notion-territory';
import { currency, number } from '@/lib/utils';

export default async function AccountDetailPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { orgId } = await requireWorkspaceContext();

  const { accountId } = await params;
  const account = await getAccountDetail(orgId, accountId);
  const territoryDetail = account
    ? null
    : await loadTerritoryStoreDetail(accountId, { orgId }).catch(() => null);
  const linkedTerritoryDetail =
    account?.notionPageId
      ? await loadTerritoryStoreDetail(account.notionPageId, { orgId }).catch(() => null)
      : null;

  if (!account && !territoryDetail) notFound();

  if (!account && territoryDetail) {
    const status = /inactive|bad customer|closed/i.test(territoryDetail.store.status) ? 'INACTIVE' : 'ACTIVE';

    return (
      <div className="space-y-6">
        <AccountHero
          title={territoryDetail.store.name}
          subtitle={territoryDetail.store.locationAddress ?? territoryDetail.store.locationLabel ?? 'No address on file'}
          status={status}
          onQuickLogHref={`/territory?storeId=${encodeURIComponent(territoryDetail.store.id)}`}
        />

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard label="Active Contacts" value={number(territoryDetail.contacts.filter((c) => c.status === 'ACTIVE').length)} />
          <MetricCard label="Total Contacts" value={number(territoryDetail.contacts.length)} />
          <MetricCard label="Check-ins" value={number(territoryDetail.checkIns.length)} />
          <MetricCard label="Status" value={territoryDetail.store.status} />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {territoryDetail.contacts.length === 0 ? (
                <p className="text-sm text-slate-500">No contacts linked.</p>
              ) : (
                territoryDetail.contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-semibold">{contact.name}</p>
                      <p className="text-sm text-slate-500">{contact.roleTitle} · {contact.email || 'No email'}</p>
                    </div>
                    <Badge variant={contact.status === 'ACTIVE' ? 'success' : 'secondary'}>{contact.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Check-in History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {territoryDetail.checkIns.length === 0 ? (
                <p className="text-sm text-slate-500">No check-ins recorded.</p>
              ) : (
                territoryDetail.checkIns.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <p className="font-semibold">{new Date(item.happenedAt).toLocaleString()}</p>
                    <p className="text-sm text-slate-500">{(item.mode ?? 'written').toUpperCase()} · {item.createdByEmail ?? 'unknown'}</p>
                    {item.noteText ? <p className="mt-1 text-sm">{item.noteText}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    );
  }

  if (!account) {
    notFound();
  }

  const openValue = account.opportunities
    .filter((opp) => opp.status === 'OPEN')
    .reduce((sum, opp) => sum + Number(opp.value), 0);
  const wonValue = account.opportunities
    .filter((opp) => opp.status === 'WON')
    .reduce((sum, opp) => sum + Number(opp.value), 0);
  const lostValue = account.opportunities
    .filter((opp) => opp.status === 'LOST')
    .reduce((sum, opp) => sum + Number(opp.value), 0);

  return (
    <div className="space-y-6">
      <AccountHero
        title={account.name}
        subtitle={`${account.address1}, ${account.city}, ${account.state} ${account.zipcode}`}
        status={account.status}
        accountId={account.id}
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Open Opportunity Value" value={currency(openValue)} />
        <MetricCard label="Active Contacts" value={number(account.contacts.filter((c) => c.status === 'ACTIVE').length)} />
        <MetricCard label="Pending Tasks" value={number(account.tasks.filter((t) => t.status !== 'DONE').length)} />
        <MetricCard label="Vendor Days" value={number(account.vendorDayEvents.length)} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {account.contacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{contact.firstName} {contact.lastName}</p>
                  <p className="text-sm text-slate-500">{contact.roleTitle} · {contact.email ?? 'No email'}</p>
                </div>
                <Badge variant={contact.status === 'ACTIVE' ? 'success' : 'secondary'}>{contact.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Priority Workflows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Referrals: <strong>{account.referrals.length}</strong></p>
            <p>Penny Bundle Submissions: <strong>{account.pennyBundles.length}</strong></p>
            <p>Overdue Snapshots: <strong>{account.overdueSnapshots.length}</strong></p>
            <p>Vendor Day Events: <strong>{account.vendorDayEvents.length}</strong></p>
            <p>Sample Box Requests: <strong>{account.sampleBoxRequests.length}</strong></p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>License:</strong> {account.licenseNumber}</p>
            <p><strong>Phone:</strong> {account.phone ?? 'No phone'}</p>
            <p><strong>Address:</strong> {account.address1}{account.address2 ? `, ${account.address2}` : ''}, {account.city}, {account.state} {account.zipcode}</p>
            <p><strong>Status:</strong> {account.status}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Opportunity Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Open:</strong> {currency(openValue)} ({account.opportunities.filter((opp) => opp.status === 'OPEN').length})</p>
            <p><strong>Won:</strong> {currency(wonValue)} ({account.opportunities.filter((opp) => opp.status === 'WON').length})</p>
            <p><strong>Lost:</strong> {currency(lostValue)} ({account.opportunities.filter((opp) => opp.status === 'LOST').length})</p>
            <p><strong>Last Contacted:</strong> {account.lastContactedAt ? new Date(account.lastContactedAt).toLocaleDateString() : 'Not recorded'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow-up & Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Follow-up Date:</strong> {linkedTerritoryDetail?.store.followUpDate ? new Date(linkedTerritoryDetail.store.followUpDate).toLocaleDateString() : 'Not set'}</p>
            <p><strong>Last Check-in:</strong> {linkedTerritoryDetail?.store.lastCheckIn ? new Date(linkedTerritoryDetail.store.lastCheckIn).toLocaleString() : 'No check-ins'}</p>
            <p><strong>Notes:</strong></p>
            <p className="rounded-lg border bg-slate-50 p-2 text-slate-700">
              {linkedTerritoryDetail?.store.notes?.trim() || 'No territory notes synced yet.'}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Check-in History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linkedTerritoryDetail?.checkIns?.length ? (
              linkedTerritoryDetail.checkIns.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <p className="font-semibold">{new Date(item.happenedAt).toLocaleString()}</p>
                  <p className="text-sm text-slate-500">{(item.mode ?? 'written').toUpperCase()} · {item.createdByEmail ?? 'unknown'}</p>
                  {item.associatedContactName ? (
                    <p className="text-xs text-slate-500">
                      Contact: {item.associatedContactName}
                      {item.associatedContactRole ? ` (${item.associatedContactRole})` : ''}
                    </p>
                  ) : null}
                  {item.noteText ? <p className="mt-1 text-sm">{item.noteText}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No check-ins recorded.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {account.activityLogs.slice(0, 12).map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                {item.description ? <p className="mt-1 text-sm text-slate-700">{item.description}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <ActivityTimeline items={account.activityLogs} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
