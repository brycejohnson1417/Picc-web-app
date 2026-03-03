'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { MobileHeader } from '@/components/mobile/mobile-header';

const items = [
  { label: 'Profile', href: '/accounts' },
  { label: 'Notion Connection', href: '/conversations' },
  { label: 'Map Preferences', href: '/territory' },
  { label: 'Route Defaults', href: '/route' },
  { label: 'Team Access', href: '/accounts' },
  { label: 'Notifications', href: '/calendar' },
  { label: 'Support', href: '/conversations' },
  { label: 'Sign Out', href: '/territory' },
];

export function SettingsMobile() {
  return (
    <div className="min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader title="Settings" />
      <div className="border-t border-[#c7c8ce]">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className="grid min-h-12 w-full grid-cols-[1fr_24px] items-center border-b border-[#c9cad0] px-5 py-3 text-left">
            <span className="truncate text-[18px] text-[#2a2c31]">{item.label}</span>
            <ChevronRight className="h-6 w-6 text-[#bcc0c7]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
