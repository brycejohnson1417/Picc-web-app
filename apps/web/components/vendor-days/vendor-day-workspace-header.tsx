'use client';

import { WorkspaceHero } from '@/components/layout/workspace-page';
import { Badge } from '@/components/ui';
import { MetricCard } from './vendor-day-primitives';

export function VendorDayWorkspaceHeader({
  eyebrow,
  title,
  description,
  openLabel,
  openValue,
  liveLabel,
  liveValue,
  requestCount,
  assignmentCount,
  isOnline,
  offlineCount,
  fieldExceptionCount,
  viewOptions,
  activeView,
  onViewChange,
}: {
  eyebrow: string;
  title: string;
  description: string;
  openLabel: string;
  openValue: string | number;
  liveLabel: string;
  liveValue: string | number;
  requestCount: number;
  assignmentCount: number;
  isOnline: boolean;
  offlineCount: number;
  fieldExceptionCount: number;
  viewOptions: Array<{ value: string; label: string }>;
  activeView: string;
  onViewChange: (nextView: string) => void;
}) {
  return (
    <>
      <WorkspaceHero
        eyebrow={eyebrow}
        title={title}
        description={description}
        metrics={
          <>
            <MetricCard label={openLabel} value={openValue} tone="warm" />
            <MetricCard label={liveLabel} value={liveValue} />
          </>
        }
      />

      <section className="rounded-[24px] border border-[#d6dbe4] bg-white p-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{requestCount} requests</Badge>
          <Badge variant="outline">{assignmentCount} assignments</Badge>
          <Badge variant={isOnline ? 'success' : 'warning'}>{isOnline ? 'Online' : 'Offline'}</Badge>
          {offlineCount > 0 ? <Badge variant="warning">{offlineCount} queued for sync</Badge> : null}
          {fieldExceptionCount > 0 ? <Badge variant="danger">{fieldExceptionCount} need review</Badge> : null}
        </div>

        <div className="mt-4 rounded-[20px] border border-[#dfe5ef] bg-[#f7f9fc] p-2">
          <div className="grid grid-cols-5 gap-2">
            {viewOptions.map((option) => {
              const active = option.value === activeView;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onViewChange(option.value)}
                  className={[
                    'rounded-[16px] px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-[#18212d] text-white shadow-[0_10px_24px_rgba(24,33,45,0.18)]' : 'bg-white text-[#596270] hover:bg-[#eef3f9]',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
