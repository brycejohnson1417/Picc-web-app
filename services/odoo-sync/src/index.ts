import { auditLog } from '../../sync-common/src/audit';

export interface OdooSyncInput {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
  runId: string;
}

export async function runOdooSync(input: OdooSyncInput) {
  auditLog('odoo_sync_started', {
    runId: input.runId,
    baseUrl: input.baseUrl,
    database: input.database,
  });

  // Placeholder for full two-way reconciliation + id mapping.
  const result = {
    runId: input.runId,
    mappedModels: ['res.partner', 'sale.order'],
    recordsUpserted: 0,
    status: 'ok',
  };

  auditLog('odoo_sync_finished', result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runId = `odoo_${Date.now()}`;
  void runOdooSync({
    baseUrl: process.env.ODOO_URL ?? 'http://localhost:8069',
    database: process.env.ODOO_DB ?? 'picc_crm',
    username: process.env.ODOO_USERNAME ?? 'admin',
    password: process.env.ODOO_PASSWORD ?? '',
    runId,
  });
}
