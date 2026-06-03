'use client';

import dynamic from 'next/dynamic';

const PipelineStageChart = dynamic(
  () => import('@/components/crm/dashboard-charts').then((mod) => mod.PipelineStageChart),
  {
    ssr: false,
    loading: () => <div className="h-[260px] w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />,
  },
);

const AccountGrowthChart = dynamic(
  () => import('@/components/crm/dashboard-charts').then((mod) => mod.AccountGrowthChart),
  {
    ssr: false,
    loading: () => <div className="h-[260px] w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />,
  },
);

export function PipelineStageChartLazy({ data }: { data: Array<{ name: string; count: number; color: string }> }) {
  return <PipelineStageChart data={data} />;
}

export function AccountGrowthChartLazy({ data }: { data: Array<{ month: string; value: number }> }) {
  return <AccountGrowthChart data={data} />;
}
