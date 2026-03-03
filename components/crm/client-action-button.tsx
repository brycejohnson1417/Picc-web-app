'use client';

import { Button } from '@/components/ui';
import { toast } from 'sonner';
import type { ReactNode } from 'react';

interface ClientActionButtonProps {
  label: string;
  actionMessage: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  className?: string;
  children?: ReactNode;
}

export function ClientActionButton({
  label,
  actionMessage,
  variant = 'secondary',
  size = 'sm',
  className = 'h-8 text-xs',
  children,
}: ClientActionButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => toast.info(actionMessage)}
    >
      {children || label}
    </Button>
  );
}
