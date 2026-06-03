'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function WorkspacePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-h-[calc(100dvh-84px)] bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)] px-4 py-5 sm:px-6', className)}>
      <div className="mx-auto flex max-w-[var(--app-shell-max)] flex-col gap-5">{children}</div>
    </div>
  );
}

export function WorkspaceHero({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  metrics?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[28px] border border-[#d6dbe4] bg-[linear-gradient(135deg,#16202b_0%,#1d5eea_58%,#4f86f3_100%)] p-5 text-white shadow-[0_24px_60px_rgba(24,33,45,0.18)]',
        className,
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{eyebrow}</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/82">{description}</p>
          {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {metrics ? <div className="grid min-w-[280px] gap-3 sm:grid-cols-2">{metrics}</div> : null}
      </div>
    </section>
  );
}

export function WorkspacePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn('rounded-[24px] border border-[#d6dbe4] bg-white p-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]', className)}>{children}</section>;
}

export function WorkspacePanelHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7583]">{eyebrow}</p> : null}
        <h2 className="mt-1 text-xl font-semibold text-[#18212d]">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm text-[#5c6674]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function WorkspaceSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <WorkspacePanel className={className}>
      <WorkspacePanelHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      <div className="mt-4">{children}</div>
    </WorkspacePanel>
  );
}
