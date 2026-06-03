import { SettingsMobile } from '@/components/mobile/settings-mobile';
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
    </WorkspacePage>
  );
}
