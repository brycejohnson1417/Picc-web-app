import { SettingsMobile } from '@/components/mobile/settings-mobile';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';

export default async function SettingsPage() {
  const { orgId } = await requireWorkspaceContext();

  const [memberships, integrations] = await Promise.all([
    prisma.membership.findMany({ where: { orgId }, orderBy: { role: 'asc' } }),
    prisma.integrationConnection.findMany({ where: { orgId }, orderBy: { provider: 'asc' } }),
  ]);

  return (
    <>
      <div className="md:hidden">
        <SettingsMobile />
      </div>

      <div className="hidden space-y-6 md:block">
        <header>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-sm text-slate-500">Role sync, integration health, custom fields, and account-wide controls.</p>
        </header>

        <Card id="team-roles">
          <CardHeader>
            <CardTitle>Team Roles (Synced from Notion Team Directory)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {memberships.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{member.clerkUserId}</p>
                  <p className="text-xs text-slate-500">Source: {member.source}</p>
                </div>
                <Badge variant="secondary">{member.role}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="integrations">
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {integrations.map((integration) => (
              <div key={integration.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{integration.name}</p>
                  <p className="text-xs text-slate-500">Provider: {integration.provider}</p>
                </div>
                <Badge variant={integration.status === 'SUCCESS' ? 'success' : integration.status === 'ERROR' ? 'danger' : 'secondary'}>
                  {integration.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
