export type NabisSyncCrmOptions = {
  syncCrm: boolean;
};

type ManualSyncRequest = {
  syncCrm?: unknown;
};

const CRM_MIRRORABLE_MANUAL_MODULES = new Set(['all', 'nabis', 'nabis-retailers']);

export function nabisCronSyncOptions(): NabisSyncCrmOptions {
  return { syncCrm: true };
}

export function nabisDashboardRefreshSyncOptions(): NabisSyncCrmOptions & { reconciliation: false } {
  return { reconciliation: false, syncCrm: true };
}

export function nabisManualSyncOptions(syncModule: string, body: ManualSyncRequest): NabisSyncCrmOptions {
  return {
    syncCrm: CRM_MIRRORABLE_MANUAL_MODULES.has(syncModule) && body.syncCrm === true,
  };
}
