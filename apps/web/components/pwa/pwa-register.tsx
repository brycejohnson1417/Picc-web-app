'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('pwa_service_worker_register_failed', error);
    });
  }, []);

  return null;
}
