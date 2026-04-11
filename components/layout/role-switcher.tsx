'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RoleDisplayNames, type AppRole } from '@/lib/types/rbac';

export function RoleSwitcher({
  activeRole,
  availableRoles,
}: {
  activeRole: AppRole;
  availableRoles: AppRole[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (availableRoles.length <= 1) {
    return null;
  }

  return (
    <label className="flex items-center gap-2 rounded-full border border-[#c7cfde] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#304153]">
      <span>View</span>
      <select
        className="bg-transparent text-[11px] font-semibold normal-case outline-none"
        value={activeRole}
        disabled={pending}
        onChange={(event) => {
          const nextRole = event.target.value as AppRole;
          startTransition(async () => {
            await fetch('/api/session/active-role', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: nextRole }),
            });
            router.refresh();
          });
        }}
      >
        {availableRoles.map((role) => (
          <option key={role} value={role}>
            {RoleDisplayNames[role]}
          </option>
        ))}
      </select>
    </label>
  );
}
