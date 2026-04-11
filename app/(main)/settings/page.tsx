import { SettingsMobile } from '@/components/mobile/settings-mobile';
import { AdminOpsPanel } from '@/components/settings/admin-ops-panel';
import { WorkerSupplyPanel } from '@/components/settings/worker-supply-panel';
import { WorkspaceHero, WorkspacePage } from '@/components/layout/workspace-page';

export default async function SettingsPage() {
  return (
    <WorkspacePage>
      <WorkspaceHero
        eyebrow="Internal Controls"
        title="Keep people, policies, and integrations in one control room."
        description="Settings should support the operating system, not compete with it. Access, worker supply, admin policy, and support all live here in one structured page."
      />
      <SettingsMobile embedded />
      <WorkerSupplyPanel embedded />
      <AdminOpsPanel embedded />
    </WorkspacePage>
  );
}
