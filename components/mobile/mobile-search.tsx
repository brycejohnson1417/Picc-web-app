'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function MobileSearch({ value, onChange, placeholder, className }: MobileSearchProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-[20px] bg-[#d1d1d6] px-4 py-3', className)}>
      <Search className="h-8 w-8 text-[#8a8d95]" strokeWidth={2} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-[20px] text-[#2d2f34] outline-none placeholder:text-[#858890]"
        placeholder={placeholder}
      />
    </div>
  );
}
