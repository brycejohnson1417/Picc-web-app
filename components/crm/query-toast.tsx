'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

interface QueryToastProps {
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
}

export function QueryToast({ message, type = 'info' }: QueryToastProps) {
  useEffect(() => {
    toast[type](message);
  }, [message, type]);

  return null;
}
