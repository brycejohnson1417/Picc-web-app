'use client';

import { createContext, useContext } from 'react';
import type { AppRole } from '@/lib/types/rbac';

export type AppAccessState = {
  role: AppRole;
  testModeEnabled: boolean;
  isAdmin: boolean;
  isGuestViewer: boolean;
  canEdit: boolean;
};

const AppAccessContext = createContext<AppAccessState | null>(null);

export function AppAccessProvider({
  value,
  children,
}: {
  value: AppAccessState;
  children: React.ReactNode;
}) {
  return <AppAccessContext.Provider value={value}>{children}</AppAccessContext.Provider>;
}

export function useAppAccess() {
  const context = useContext(AppAccessContext);
  if (!context) {
    throw new Error('useAppAccess must be used within <AppAccessProvider />');
  }
  return context;
}
