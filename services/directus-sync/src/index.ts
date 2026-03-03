import { auditLog } from '../../sync-common/src/audit';

export interface DirectusSyncInput {
  baseUrl: string;
  token: string;
  runId: string;
}

export async function runDirectusSync(input: DirectusSyncInput) {
  auditLog('directus_sync_started', { runId: input.runId, baseUrl: input.baseUrl });

  // Placeholder for full collection-level upserts.
  const result = {
    runId: input.runId,
    syncedCollections: ['territory_store_read_model', 'check_in', 'territory_filter_preset'],
    recordsSynced: 0,
    status: 'ok',
  };

  auditLog('directus_sync_finished', result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runId = `directus_${Date.now()}`;
  void runDirectusSync({
    baseUrl: process.env.DIRECTUS_URL ?? 'http://localhost:8055',
    token: process.env.DIRECTUS_TOKEN ?? '',
    runId,
  });
}
