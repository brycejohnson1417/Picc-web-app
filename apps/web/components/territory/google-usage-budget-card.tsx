'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type GoogleUsageSummary = {
  generatedAt: string;
  month: string;
  today: string;
  budgetUsd: number;
  remainingBudgetUsd: number;
  estimatedMonthToDateUsd: number;
  projectedMonthlyUsd: number;
  capReached: boolean;
  pricingUsdPerThousand: {
    geocoding: number;
    routes_compute: number;
    routes_optimize: number;
  };
  todayCounts: {
    geocoding: number;
    routes_compute: number;
    routes_optimize: number;
  };
  monthToDateCounts: {
    geocoding: number;
    routes_compute: number;
    routes_optimize: number;
  };
};

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatCount(value: number) {
  return Intl.NumberFormat('en-US').format(value);
}

export function GoogleUsageBudgetCard({ compact = false }: { compact?: boolean }) {
  const usageQuery = useQuery({
    queryKey: ['google-usage-summary'],
    queryFn: async () => {
      const response = await fetch('/api/territory/google-usage');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to fetch Google usage');
      }
      return payload as GoogleUsageSummary;
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });

  if (usageQuery.isLoading && !usageQuery.data) {
    return <p className="text-sm text-slate-500">Loading Google usage…</p>;
  }

  if (usageQuery.isError && !usageQuery.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <p className="font-medium">Google budget tracker unavailable</p>
        <p className="mt-1">
          {usageQuery.error instanceof Error ? usageQuery.error.message : 'Failed to load usage data.'}
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => {
            void usageQuery.refetch();
          }}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const summary = usageQuery.data;
  if (!summary) {
    return null;
  }

  const percentUsed = summary.budgetUsd > 0 ? Math.min(100, (summary.estimatedMonthToDateUsd / summary.budgetUsd) * 100) : 0;
  const progressClass =
    percentUsed >= 100
      ? 'bg-red-500'
      : percentUsed >= 80
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Google API Budget</p>
          <p className="text-xs text-slate-500">Month {summary.month}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void usageQuery.refetch();
          }}
          disabled={usageQuery.isFetching}
        >
          <RefreshCw className={cn('mr-1 h-4 w-4', usageQuery.isFetching ? 'animate-spin' : '')} />
          Refresh
        </Button>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={cn('h-full transition-all', progressClass)} style={{ width: `${percentUsed}%` }} />
      </div>

      <div className={cn('grid gap-2 text-sm', compact ? 'grid-cols-2' : 'grid-cols-4')}>
        <Metric label="Month-to-date" value={formatUsd(summary.estimatedMonthToDateUsd)} />
        <Metric label="Projected month" value={formatUsd(summary.projectedMonthlyUsd)} />
        <Metric label="Budget cap" value={formatUsd(summary.budgetUsd)} />
        <Metric label="Remaining" value={formatUsd(summary.remainingBudgetUsd)} />
      </div>

      {summary.capReached ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="inline-flex items-center gap-1 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Hard cap reached.
          </p>
          <p className="mt-1">Google paid calls are now blocked and route/geocode requests use fallback behavior.</p>
        </div>
      ) : null}

      <div className={cn('grid gap-2 text-xs text-slate-600', compact ? 'grid-cols-1' : 'grid-cols-3')}>
        <SkuMetric
          label="Geocoding"
          calls={summary.monthToDateCounts.geocoding}
          todayCalls={summary.todayCounts.geocoding}
          perThousand={summary.pricingUsdPerThousand.geocoding}
        />
        <SkuMetric
          label="Routes Compute"
          calls={summary.monthToDateCounts.routes_compute}
          todayCalls={summary.todayCounts.routes_compute}
          perThousand={summary.pricingUsdPerThousand.routes_compute}
        />
        <SkuMetric
          label="Route Optimize"
          calls={summary.monthToDateCounts.routes_optimize}
          todayCalls={summary.todayCounts.routes_optimize}
          perThousand={summary.pricingUsdPerThousand.routes_optimize}
        />
      </div>

      <p className="text-[11px] text-slate-400">
        Last updated {new Date(summary.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SkuMetric({
  label,
  calls,
  todayCalls,
  perThousand,
}: {
  label: string;
  calls: number;
  todayCalls: number;
  perThousand: number;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2 py-2">
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="mt-1">Month calls: {formatCount(calls)}</p>
      <p>Today calls: {formatCount(todayCalls)}</p>
      <p>Rate: {formatUsd(perThousand)}/1k</p>
    </div>
  );
}
