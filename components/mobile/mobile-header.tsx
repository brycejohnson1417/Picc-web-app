'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function MobileHeader({ title, left, right, children, className }: MobileHeaderProps) {
  return (
    <header className={cn('sticky top-0 z-[2500] bg-[#c93412] text-white shadow-[0_2px_0_rgba(0,0,0,0.1)]', className)}>
      <div className="px-5 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="mb-2 flex items-center justify-between text-[14px] opacity-90">
          <span className="font-semibold">12:20</span>
          <span className="font-semibold">100%</span>
        </div>

        <div className="relative flex items-center justify-between pb-2 pt-1">
          <div className="min-w-16">{left}</div>
          {title ? <h1 className="absolute left-1/2 -translate-x-1/2 text-[28px] font-semibold tracking-[0.2px]">{title}</h1> : null}
          <div className="min-w-16 text-right">{right}</div>
        </div>
      </div>
      {children ? <div className="border-t border-[#b52f10] bg-[#c93412]/95 px-4 pb-3 pt-2">{children}</div> : null}
    </header>
  );
}
