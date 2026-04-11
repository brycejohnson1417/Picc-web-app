import { SettingsMobile } from '@/components/mobile/settings-mobile';
import { AdminOpsPanel } from '@/components/settings/admin-ops-panel';
import { WorkerSupplyPanel } from '@/components/settings/worker-supply-panel';

export default async function SettingsPage() {
  return (
    <>
      <SettingsMobile />
      <WorkerSupplyPanel />
      <AdminOpsPanel />
    </>
  );
}
