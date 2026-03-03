'use client';

import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { MobileHeader } from '@/components/mobile/mobile-header';

const items = [
  'Profile',
  'Notion Connection',
  'Map Preferences',
  'Route Defaults',
  'Team Access',
  'Notifications',
  'Support',
  'Sign Out',
];

export function SettingsMobile() {
  return (
    <div className="min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader title="Settings" />
      <div className="border-t border-[#c7c8ce]">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className="grid w-full grid-cols-[1fr_24px] items-center border-b border-[#c9cad0] px-5 py-4 text-left"
            onClick={() => toast.info(`${item} settings are available on desktop for now.`)}
          >
            <span className="text-[23px] text-[#2a2c31]">{item}</span>
            <ChevronRight className="h-7 w-7 text-[#bcc0c7]" />
          </button>
        ))}
      </div>
    </div>
  );
}
