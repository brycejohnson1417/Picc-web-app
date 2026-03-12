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
      <div className="px-3 pb-0.5 pt-[max(4px,env(safe-area-inset-top))] md:px-5">
        <div className="relative flex items-center justify-between py-0.5">
          <div className="min-w-16">{left}</div>
          {title ? <h1 className="absolute left-1/2 -translate-x-1/2 text-[16px] font-semibold tracking-[0.2px] md:text-[18px]">{title}</h1> : null}
          <div className="min-w-16 text-right">{right}</div>
        </div>
      </div>
      {children ? <div className="border-t border-[#b52f10] bg-[#c93412]/95 px-2 pb-1 pt-1 md:px-4">{children}</div> : null}
    </header>
  );
}
