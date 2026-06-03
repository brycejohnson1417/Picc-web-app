'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

type PrewarmAction = 'sync_only' | 'geocode_missing' | 'full_rebuild';

type PrewarmResult = {
  action: PrewarmAction;
  warmedLookups: number;
  recordsRead: number;
  unresolvedLocationCount: number;
  approximateCount: number;
  syncedAt: string | null;
};

type AuditResult = {
  totalNotionRows: number;
  mappedRows: number;
  approximateRows: number;
  unresolvedRows: number;
  contactsLinked: number;
  contactsUnlinked: number;
  syncedAt: string | null;
};

export function TerritoryAdminSyncControls() {
  const [running, setRunning] = useState(false);
  const [prewarm, setPrewarm] = useState<PrewarmResult | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: PrewarmAction) {
    setRunning(true);
    setError(null);

    try {
      const prewarmResponse = await fetch('/api/territory/prewarm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      const prewarmPayload = await prewarmResponse.json().catch(() => ({}));
      if (!prewarmResponse.ok) {
        throw new Error(prewarmPayload?.error ?? 'Refresh failed');
      }
      setPrewarm(prewarmPayload as PrewarmResult);

      const auditResponse = await fetch('/api/territory/sync-audit');
      const auditPayload = await auditResponse.json().catch(() => ({}));
      if (!auditResponse.ok) {
        throw new Error(auditPayload?.error ?? 'Sync audit failed');
      }
      setAudit(auditPayload as AuditResult);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Refresh failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void run('sync_only')} disabled={running}>
          Sync Only
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void run('geocode_missing')} disabled={running}>
          Geocode Missing
        </Button>
        <Button size="sm" variant="outline" onClick={() => void run('full_rebuild')} disabled={running}>
          Full Rebuild
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {prewarm ? (
        <div className="rounded-lg border p-3 text-sm">
          <p><strong>Last action:</strong> {prewarm.action}</p>
          <p><strong>Rows read:</strong> {prewarm.recordsRead}</p>
          <p><strong>Geocoded:</strong> {prewarm.warmedLookups}</p>
          <p><strong>Approximate pins:</strong> {prewarm.approximateCount}</p>
          <p><strong>Synthetic fallbacks:</strong> {prewarm.unresolvedLocationCount}</p>
          <p><strong>Synced at:</strong> {prewarm.syncedAt ? new Date(prewarm.syncedAt).toLocaleString() : 'n/a'}</p>
        </div>
      ) : null}

      {audit ? (
        <div className="rounded-lg border p-3 text-sm">
          <p><strong>Total Notion rows:</strong> {audit.totalNotionRows}</p>
          <p><strong>Mapped rows:</strong> {audit.mappedRows}</p>
          <p><strong>Approximate rows:</strong> {audit.approximateRows}</p>
          <p><strong>Synthetic rows:</strong> {audit.unresolvedRows}</p>
          <p><strong>Contacts linked:</strong> {audit.contactsLinked}</p>
          <p><strong>Contacts unlinked:</strong> {audit.contactsUnlinked}</p>
        </div>
      ) : null}
    </div>
  );
}
