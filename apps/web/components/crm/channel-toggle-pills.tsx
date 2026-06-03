'use client';

import { Channel } from '@prisma/client';
import { Button } from '@/components/ui';
import { Mail, MessageSquare, Phone, Smartphone, CircleEllipsis } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHANNELS: Array<{ key: 'ALL' | Channel; label: string; icon: React.ReactNode }> = [
  { key: 'ALL', label: 'All', icon: <CircleEllipsis className="h-4 w-4" /> },
  { key: 'EMAIL', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { key: 'SMS', label: 'SMS', icon: <MessageSquare className="h-4 w-4" /> },
  { key: 'PHONE_CALL', label: 'Phone', icon: <Phone className="h-4 w-4" /> },
  { key: 'WHATSAPP', label: 'WhatsApp', icon: <Smartphone className="h-4 w-4" /> },
  { key: 'OTHER', label: 'Other', icon: <CircleEllipsis className="h-4 w-4" /> },
];

export function ChannelTogglePills({
  value,
  onChange,
  counts,
}: {
  value: 'ALL' | Channel;
  onChange: (value: 'ALL' | Channel) => void;
  counts?: Partial<Record<'ALL' | Channel, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHANNELS.map((channel) => (
        <Button
          key={channel.key}
          variant={value === channel.key ? 'default' : 'secondary'}
          className={cn('rounded-full px-4')}
          onClick={() => onChange(channel.key)}
        >
          {channel.icon}
          {channel.label}
          <span className="text-xs opacity-75">{counts?.[channel.key] ?? 0}</span>
        </Button>
      ))}
    </div>
  );
}
