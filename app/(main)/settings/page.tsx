import { SettingsMobile } from '@/components/mobile/settings-mobile';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { SettingsClient } from '@/components/crm/settings-client';
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
        <SettingsClient initialMemberships={memberships} initialIntegrations={integrations} />
      </div>
    </>
  );
}
