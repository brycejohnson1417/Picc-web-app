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
    <header
      className={cn(
        'sticky top-0 z-[2500] border-b border-[#d7dde7] bg-[linear-gradient(180deg,rgba(249,251,255,0.96)_0%,rgba(241,245,250,0.94)_100%)] text-[#1f232b] backdrop-blur-xl',
        className,
      )}
    >
      <div className="px-3 pb-3 pt-[max(8px,env(safe-area-inset-top))] md:px-5">
        <div className="grid min-h-[40px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0">{left}</div>
          {title ? (
            <div className="min-w-0 text-center">
              <h1 className="text-[16px] font-semibold tracking-[0.2px] text-[#18212d] md:text-[18px]">{title}</h1>
            </div>
          ) : null}
          <div className="flex min-w-0 justify-end text-right">{right}</div>
        </div>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </header>
  );
}
