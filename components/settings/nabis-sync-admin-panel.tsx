'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, History, RefreshCw, Store, TimerReset } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/ui';
import { WorkspacePanel, WorkspacePanelHeader } from '@/components/layout/workspace-page';

type SyncStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';

type SyncModule = {
  module: string;
  status: SyncStatus;
  updatedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  error: string | null;
  rateLimited: boolean;
  retryAfterMs: number | null;
  activeModule: string | null;
  activeExpiresAt: string | null;
  leaseHolderId: string | null;
  leaseRefreshedAt: string | null;
  leaseExpiresAt: string | null;
  stats: {
    recordsRead: number | null;
    orders: number | null;
    uniqueOrders: number | null;
    retailers: number | null;
    lineItems: number | null;
    metricRows: number | null;
    pagesScanned: number | null;
  };
  historicalBackfill: boolean;
  cutoffDate: string | null;
  cutoffReached: boolean;
  earliestOrderCreatedAt: string | null;
  latestOrderCreatedAt: string | null;
};

type SyncRun = {
  id: string;
  module: string;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  recordsIn: number;
  recordsUpserted: number;
  error: string | null;
};

type NabisSyncStatusResponse = {
  integration: {
    id: string | null;
    name: string;
    status: SyncStatus;
    lastSyncedAt: string | null;
    updatedAt: string | null;
  };
  counts: {
    retailers: number;
    orders: number;
    orderLines: number;
    earliestOrderCreatedAt: string | null;
    latestOrderCreatedAt: string | null;
  };
  modules: SyncModule[];
  latestError: {
    module: string;
    message: string;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  recentRuns: SyncRun[];
  controls: {
    recentOrders: { enabled: boolean; module: string; label: string };
    retailers: { enabled: boolean; module: string; label: string };
    historicalBackfill: { enabled: boolean; module: string; label: string; description: string };
  };
};

const moduleLabels: Record<string, string> = {
  orders: 'Recent order sync',
  retailers: 'Retailer sync',
  orders_reconcile: 'Historical reconciliation',
  orders_historical_backfill: 'Historical backfill',
  nabis_global_sync_lease: 'Global sync lease',
};

function statusBadgeVariant(status: SyncStatus) {
  if (status === 'SUCCESS') return 'success' as const;
  if (status === 'ERROR') return 'danger' as const;
  if (status === 'RUNNING') return 'warning' as const;
  return 'secondary' as const;
}

function formatDateTime(value: string | null | undefined, fallback = 'Not recorded') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '0';
}

function shortModuleLabel(module: string) {
  return moduleLabels[module] ?? module.replaceAll('_', ' ');
}

export function NabisSyncAdminPanel() {
  const [status, setStatus] = useState<NabisSyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningModule, setRunningModule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modules = useMemo(() => {
    const source = status?.modules ?? [];
    return ['orders', 'retailers', 'orders_reconcile', 'orders_historical_backfill', 'nabis_global_sync_lease']
      .map((module) => source.find((entry) => entry.module === module))
      .filter((entry): entry is SyncModule => Boolean(entry));
  }, [status?.modules]);

  const loadStatus = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const response = await fetch('/api/sync/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to load Nabis sync status');
      }
      setStatus(payload as NabisSyncStatusResponse);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load Nabis sync status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus('initial');
  }, [loadStatus]);

  async function runSync(module: string, label: string) {
    setRunningModule(module);
    setError(null);
    try {
      const response = await fetch('/api/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? `${label} failed`);
      }
      toast.success(`${label} started and completed.`);
      await loadStatus('refresh');
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : `${label} failed`;
      setError(message);
      toast.error(message);
      await loadStatus('refresh');
    } finally {
      setRunningModule(null);
    }
  }

  return (
    <WorkspacePanel className="space-y-4">
      <WorkspacePanelHeader
        eyebrow="Nabis Sync"
        title="Freshness, coverage, and sync controls"
        description="Recent order sync, retailer sync, and historical coverage are separated so stale data is visible before it affects dashboards or PPP savings."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void loadStatus('refresh')} disabled={refreshing || loading}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing' : 'Refresh Status'}
        </Button>
        <Badge variant={statusBadgeVariant(status?.integration.status ?? 'IDLE')}>{status?.integration.status.toLowerCase() ?? 'loading'}</Badge>
        {status?.integration.lastSyncedAt ? <span className="text-[13px] text-[#5c6674]">Last integration sync: {formatDateTime(status.integration.lastSyncedAt)}</span> : null}
      </div>

      {loading ? <p className="text-sm text-[#5c6674]">Loading Nabis sync health...</p> : null}
      {error ? (
        <div className="rounded-2xl border border-[#f1b8a8] bg-[#fff5f1] px-4 py-3 text-sm text-[#a23b22]">
          {error}
        </div>
      ) : null}

      {status ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<Store className="h-4 w-4" />} label="Cached retailers" value={formatNumber(status.counts.retailers)} />
            <MetricCard icon={<Database className="h-4 w-4" />} label="Cached orders" value={formatNumber(status.counts.orders)} />
            <MetricCard icon={<Database className="h-4 w-4" />} label="Cached order lines" value={formatNumber(status.counts.orderLines)} />
            <MetricCard icon={<History className="h-4 w-4" />} label="Order coverage" value={formatDateRange(status.counts.earliestOrderCreatedAt, status.counts.latestOrderCreatedAt)} />
          </div>

          {status.latestError ? (
            <div className="rounded-2xl border border-[#f1b8a8] bg-[#fff5f1] px-4 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-[#b3391b]" />
                <div>
                  <p className="text-[15px] font-semibold text-[#7e2915]">Latest sync error: {shortModuleLabel(status.latestError.module)}</p>
                  <p className="mt-1 text-sm text-[#8a3a23]">{status.latestError.message}</p>
                  <p className="mt-2 text-[12px] text-[#8a3a23]">{formatDateTime(status.latestError.finishedAt ?? status.latestError.startedAt)}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-4">
            {modules.map((module) => (
              <div key={module.module} className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-[#1d1f23]">{shortModuleLabel(module.module)}</p>
                    <p className="mt-1 text-[12px] text-[#5c6674]">Updated: {formatDateTime(module.updatedAt)}</p>
                  </div>
                  <Badge variant={statusBadgeVariant(module.status)}>{module.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-3 text-sm text-[#38404d]">Last success: {formatDateTime(module.lastSuccessfulSyncAt)}</p>
                {module.rateLimited ? <p className="mt-2 text-sm text-[#a23b22]">Rate limited; retry after {Math.ceil((module.retryAfterMs ?? 0) / 1000)}s.</p> : null}
                {module.error ? <p className="mt-2 text-sm text-[#a23b22]">{module.error}</p> : null}
                {module.module === 'nabis_global_sync_lease' ? (
                  <div className="mt-3 rounded-xl bg-white px-3 py-2 text-[12px] text-[#5c6674]">
                    <p>Holder: {module.leaseHolderId ?? 'none'}</p>
                    <p>Expires: {formatDateTime(module.leaseExpiresAt, 'not active')}</p>
                  </div>
                ) : null}
                {module.historicalBackfill ? (
                  <div className="mt-3 rounded-xl bg-white px-3 py-2 text-[12px] text-[#5c6674]">
                    <p>Cutoff: {formatDateTime(module.cutoffDate, 'not recorded')}</p>
                    <p>Pages scanned: {formatNumber(module.stats.pagesScanned)}</p>
                    <p>Coverage: {formatDateRange(module.earliestOrderCreatedAt, module.latestOrderCreatedAt)}</p>
                    <p>Cutoff reached: {module.cutoffReached ? 'yes' : 'not yet'}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <SyncActionButton
              icon={<RefreshCw className="h-4 w-4" />}
              title={status.controls.recentOrders.label}
              description="Pulls the normal recent order window into local cache."
              disabled={!status.controls.recentOrders.enabled || Boolean(runningModule)}
              loading={runningModule === status.controls.recentOrders.module}
              onClick={() => void runSync(status.controls.recentOrders.module, status.controls.recentOrders.label)}
            />
            <SyncActionButton
              icon={<Store className="h-4 w-4" />}
              title={status.controls.retailers.label}
              description="Refreshes local Nabis retailer records without CRM mirroring."
              disabled={!status.controls.retailers.enabled || Boolean(runningModule)}
              loading={runningModule === status.controls.retailers.module}
              onClick={() => void runSync(status.controls.retailers.module, status.controls.retailers.label)}
            />
            <SyncActionButton
              icon={<TimerReset className="h-4 w-4" />}
              title={status.controls.historicalBackfill.label}
              description={status.controls.historicalBackfill.description}
              disabled={!status.controls.historicalBackfill.enabled || Boolean(runningModule)}
              loading={runningModule === status.controls.historicalBackfill.module}
              onClick={() => void runSync(status.controls.historicalBackfill.module, status.controls.historicalBackfill.label)}
            />
          </div>

          <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Recent Sync Runs</p>
            {status.recentRuns.length === 0 ? <p className="mt-2 text-sm text-[#5c6674]">No Nabis sync runs recorded yet.</p> : null}
            <div className="mt-3 space-y-2">
              {status.recentRuns.slice(0, 6).map((run) => (
                <div key={run.id} className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-[#1d1f23]">{shortModuleLabel(run.module)}</p>
                      <p className="mt-1 text-[12px] text-[#5c6674]">
                        {formatDateTime(run.startedAt)} · in {run.recordsIn.toLocaleString()} · upserted {run.recordsUpserted.toLocaleString()}
                      </p>
                      {run.error ? <p className="mt-1 text-[12px] text-[#a23b22]">{run.error}</p> : null}
                    </div>
                    <Badge variant={statusBadgeVariant(run.status)}>{run.status.toLowerCase()}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </WorkspacePanel>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
      <div className="flex items-center gap-2 text-[#3559a9]">
        {icon}
        <p className="text-[12px] font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 text-[22px] font-semibold text-[#1d1f23]">{value}</p>
    </div>
  );
}

function SyncActionButton({
  icon,
  title,
  description,
  disabled,
  loading,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-2xl border border-[#d6dae2] bg-white px-4 py-4 text-left transition hover:border-[#9db8f7] hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-center gap-2 text-[#24324f]">
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : icon}
        <p className="text-[15px] font-semibold">{loading ? 'Running...' : title}</p>
      </div>
      <p className="mt-2 text-sm text-[#5c6674]">{description}</p>
    </button>
  );
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return 'No orders';
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const startLabel = startDate && !Number.isNaN(startDate.getTime()) ? startDate.toLocaleDateString() : 'unknown';
  const endLabel = endDate && !Number.isNaN(endDate.getTime()) ? endDate.toLocaleDateString() : 'unknown';
  return `${startLabel} to ${endLabel}`;
}
