'use client';

import { cn } from '@/lib/utils';

export interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({ value, options, onChange, className }: SegmentedControlProps) {
  return (
    <div className={cn('grid rounded-xl bg-[#d6d6da] p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg px-2 py-2 text-[14px] font-medium transition',
              active ? 'bg-[#cd3814] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]' : 'text-[#c64624]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
