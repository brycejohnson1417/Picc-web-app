import { AlertCircle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import type { RuntimeFreshness } from '@/lib/runtime/account-contact-contract';
import { cn } from '@/lib/utils';

function formatRelativeAge(ageSeconds: number | null) {
  if (ageSeconds === null) {
    return 'unknown';
  }

  if (ageSeconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'No sync recorded';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid sync time';
  }

  return date.toLocaleString();
}

function stateTone(state: RuntimeFreshness['state']) {
  if (state === 'fresh') {
    return {
      icon: CheckCircle2,
      badge: 'success' as const,
      label: 'Fresh',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100',
    };
  }

  if (state === 'syncing') {
    return {
      icon: Loader2,
      badge: 'warning' as const,
      label: 'Syncing',
      className: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100',
    };
  }

  if (state === 'error') {
    return {
      icon: AlertCircle,
      badge: 'danger' as const,
      label: 'Sync issue',
      className: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100',
    };
  }

  return {
    icon: Clock3,
    badge: 'warning' as const,
    label: state === 'stale' ? 'Stale' : 'Unknown',
    className: 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100',
  };
}

export function DataFreshnessBadge({ freshness }: { freshness: RuntimeFreshness }) {
  const tone = stateTone(freshness.state);

  return (
    <Badge variant={tone.badge} title={`${freshness.label}: ${freshness.detail}`}>
      {tone.label}
    </Badge>
  );
}

export function DataFreshnessBanner({
  freshness,
  action,
  compact = false,
  className,
}: {
  freshness: RuntimeFreshness;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const tone = stateTone(freshness.state);
  const Icon = tone.icon;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        tone.className,
        compact ? 'py-2' : null,
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', freshness.state === 'syncing' ? 'animate-spin' : null)} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{freshness.label}</span>
            <DataFreshnessBadge freshness={freshness} />
            <span className="text-xs opacity-75">{formatRelativeAge(freshness.ageSeconds)}</span>
          </div>
          <p className="mt-1 leading-5 opacity-85">{freshness.detail}</p>
          <p className="mt-1 text-xs opacity-70">
            Last sync: {formatTimestamp(freshness.syncedAt)} · Records: {freshness.recordsRead.toLocaleString()}
            {freshness.error ? ` · ${freshness.error}` : ''}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
