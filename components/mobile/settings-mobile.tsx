'use client';

import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { MobileHeader } from '@/components/mobile/mobile-header';

type SettingsItem = {
  label: string;
  action: 'route' | 'mailto' | 'signout';
  value: string;
};

const items: SettingsItem[] = [
  { label: 'Profile', action: 'route', value: '/settings' },
  { label: 'Notion Connection', action: 'route', value: '/settings#integrations' },
  { label: 'Map Preferences', action: 'route', value: '/territory' },
  { label: 'Route Defaults', action: 'route', value: '/route' },
  { label: 'Team Access', action: 'route', value: '/settings#team-roles' },
  { label: 'Notifications', action: 'route', value: '/conversations' },
  { label: 'Support', action: 'mailto', value: 'support@picc.co' },
  { label: 'Sign Out', action: 'signout', value: '' },
];

export function SettingsMobile() {
  const router = useRouter();
  const { signOut } = useClerk();

  async function handleItemClick(item: SettingsItem) {
    if (item.action === 'route') {
      router.push(item.value);
      return;
    }

    if (item.action === 'mailto') {
      window.open(`mailto:${item.value}?subject=PICC%20Support`, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      await signOut({ redirectUrl: '/sign-in' });
    } catch {
      toast.error('Sign out failed. Please try again.');
    }
  }

  return (
    <div className="min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader title="Settings" />
      <div className="border-t border-[#c7c8ce]">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              void handleItemClick(item);
            }}
            className="grid w-full grid-cols-[1fr_24px] items-center border-b border-[#c9cad0] px-5 py-4 text-left"
          >
            <span className="text-[23px] text-[#2a2c31]">{item.label}</span>
            <ChevronRight className="h-7 w-7 text-[#bcc0c7]" />
          </button>
        ))}
      </div>
    </div>
  );
}
