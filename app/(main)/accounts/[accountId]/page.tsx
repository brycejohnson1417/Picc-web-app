import { notFound } from 'next/navigation';
import { AccountHero } from '@/components/crm/account-hero';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import { loadTerritoryStoreDetail } from '@/lib/server/notion-territory';
import { number } from '@/lib/utils';

function toActiveStatus(status: string): 'ACTIVE' | 'INACTIVE' {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes('bad customer') || normalized.includes('inactive') || normalized.includes('closed')) {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

function formatCheckInMode(value: string) {
  if (value === 'voice') return 'voice';
  if (value === 'written') return 'written';
  return 'comment';
}

export default async function AccountDetailPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { orgId } = await requireWorkspaceContext();
  const { accountId } = await params;
  const resolved = await resolveAccountIdentity(accountId, orgId);
  const notionPageId = resolved?.notionPageId;

  if (!notionPageId) {
    notFound();
  }

  const detail = await loadTerritoryStoreDetail(notionPageId);
  const store = detail.store;

  return (
    <div className="space-y-6">
      <AccountHero
        title={store.name}
        subtitle={store.locationAddress ?? store.locationLabel ?? 'No address on file'}
        status={toActiveStatus(store.status)}
        onQuickLogHref={`/territory?focus=${encodeURIComponent(store.id)}`}
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Active Contacts" value={number(detail.contacts.filter((contact) => contact.status === 'ACTIVE').length)} />
        <MetricCard label="Check-ins" value={number(detail.checkIns.length)} />
        <MetricCard label="Vendor Days" value={number(detail.vendorDays.total)} />
        <MetricCard label="Approximate Pin" value={store.isApproximate ? 'Yes' : 'No'} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Live Account Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Status: <strong>{store.status}</strong></p>
            <p>License: <strong>{store.licenseNumber ?? '—'}</strong></p>
            <p>Last check-in: <strong>{store.lastCheckIn ? new Date(store.lastCheckIn).toLocaleString() : 'No check-ins'}</strong></p>
            <p>Follow-up date: <strong>{store.followUpDate ? new Date(store.followUpDate).toLocaleDateString() : 'Not set'}</strong></p>
            <p>Location precision: <strong>{store.locationPrecision}</strong></p>
            <p>
              Notion page:{' '}
              <a
                className="text-blue-600 underline"
                href={`https://www.notion.so/${store.notionPageId.replace(/-/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vendor Days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Total: <strong>{detail.vendorDays.total}</strong></p>
            <p>Upcoming: <strong>{detail.vendorDays.upcomingCount}</strong></p>
            {detail.vendorDays.recent.slice(0, 5).map((event) => (
              <div key={event.id} className="rounded border p-2">
                <p className="font-medium">{new Date(event.eventDate).toLocaleString()}</p>
                <p>{event.status} · Rep: {event.repName ?? 'Unassigned'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.contacts.length === 0 ? <p className="text-sm text-slate-500">No contacts linked.</p> : null}
            {detail.contacts.map((contact) => (
              <div key={contact.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{contact.name}</p>
                  <Badge variant={contact.status === 'ACTIVE' ? 'success' : 'secondary'}>{contact.status}</Badge>
                </div>
                <p className="text-sm text-slate-500">{contact.roleTitle} · {contact.email || 'No email'}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Check-in History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.checkIns.length === 0 ? <p className="text-sm text-slate-500">No check-in history yet.</p> : null}
            {detail.checkIns.slice(0, 12).map((checkIn) => (
              <div key={`${checkIn.source}-${checkIn.id}`} className="rounded-lg border p-3">
                <p className="font-semibold">{new Date(checkIn.happenedAt).toLocaleString()}</p>
                <p className="text-sm text-slate-500">
                  {checkIn.createdByLabel ? `${checkIn.createdByLabel} · ` : ''}
                  {formatCheckInMode(checkIn.mode)}
                </p>
                <p className="text-sm">{checkIn.notePreview || 'No note preview'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
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
