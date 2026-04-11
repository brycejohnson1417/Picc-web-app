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
      <div className="px-3 pb-1 pt-[max(6px,env(safe-area-inset-top))] md:px-5">
        <div className="relative flex items-center justify-between py-1">
          <div className="min-w-16">{left}</div>
          {title ? (
            <div className="absolute left-1/2 -translate-x-1/2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6a7583]">PICC Internal Platform</p>
              <h1 className="text-[16px] font-semibold tracking-[0.2px] text-[#18212d] md:text-[18px]">{title}</h1>
            </div>
          ) : null}
          <div className="min-w-16 text-right">{right}</div>
        </div>
      </div>
      {children ? <div className="border-t border-[#e2e8f0] bg-white/90 px-2 pb-2 pt-2 md:px-4">{children}</div> : null}
    </header>
  );
}
