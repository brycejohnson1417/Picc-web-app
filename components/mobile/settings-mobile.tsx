'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { GoogleUsageBudgetCard } from '@/components/territory/google-usage-budget-card';

type SettingsItem = {
  label: string;
  action: 'route' | 'mailto' | 'signout';
  value: string;
};

const items: SettingsItem[] = [
  { label: 'Profile', action: 'route', value: '/settings' },
  { label: 'Notion Connection', action: 'route', value: '/settings#integrations' },
  { label: 'Map Preferences', action: 'route', value: '/territory' },
  { label: 'Google API Budget', action: 'route', value: '/settings#google-budget' },
  { label: 'Route Defaults', action: 'route', value: '/route' },
  { label: 'Vendor Days', action: 'route', value: '/vendor-days' },
  { label: 'Team Access', action: 'route', value: '/settings#team-roles' },
  { label: 'Support', action: 'mailto', value: 'support@picc.co' },
  { label: 'Sign Out', action: 'signout', value: '' },
];

interface TeamActivityResponse {
  teamMembers: Array<{
    id: string;
    displayName: string;
    email: string | null;
    lastLoginAt: string | null;
    loginCount30d: number;
    activityCount30d: number;
    checkInCount30d: number;
    vendorDayCount30d: number;
    totalActions30d: number;
  }>;
  recentEvents: Array<{
    id: string;
    happenedAt: string;
    actor: string;
    type: string;
    title: string;
    detail: string | null;
  }>;
  meta: {
    windowDays: number;
    teamMemberCount: number;
  };
}

export function SettingsMobile() {
  const router = useRouter();
  const { signOut } = useClerk();
  const [teamActivity, setTeamActivity] = useState<TeamActivityResponse | null>(null);
  const [loadingTeamActivity, setLoadingTeamActivity] = useState(true);
  const [teamActivityError, setTeamActivityError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadTeamActivity = async () => {
      setLoadingTeamActivity(true);
      setTeamActivityError(null);
      try {
        const response = await fetch('/api/settings/team-activity', {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Unable to load team activity');
        }

        const payload = (await response.json()) as TeamActivityResponse;
        setTeamActivity(payload);
      } catch (error) {
        if (controller.signal.aborted) return;
        setTeamActivity(null);
        setTeamActivityError(error instanceof Error ? error.message : 'Unable to load team activity');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingTeamActivity(false);
        }
      }
    };

    void loadTeamActivity();

    return () => controller.abort();
  }, []);

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
    <div className="min-h-[calc(100dvh-92px)] bg-[#e6e6e9]">
      <MobileHeader title="Settings" />
      <div className="border-y border-[#c7c8ce] bg-white px-4 py-3">
        <GoogleUsageBudgetCard compact />
      </div>
      <div className="border-b border-[#c7c8ce] bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[18px] font-semibold text-[#1d1f23]">Team Activity</p>
            <p className="text-[14px] text-[#666b75]">Logins, usage, and updates from the last 30 days.</p>
          </div>
          {teamActivity?.meta ? <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-[12px] font-semibold text-[#3f5fb3]">{teamActivity.meta.teamMemberCount} active</span> : null}
        </div>

        {loadingTeamActivity ? <p className="mt-3 text-[14px] text-[#666b75]">Loading team activity…</p> : null}
        {teamActivityError ? <p className="mt-3 text-[14px] text-[#a23b22]">{teamActivityError}</p> : null}

        {!loadingTeamActivity && !teamActivityError ? (
          <>
            <div className="mt-4 space-y-3">
              {(teamActivity?.teamMembers ?? []).slice(0, 6).map((member) => (
                <div key={member.id} className="rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-semibold text-[#1d1f23]">{member.displayName}</p>
                      <p className="text-[13px] text-[#666b75]">{member.email || member.id}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-[#4b5565]">
                      {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleDateString() : 'No login yet'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-[#38404d]">
                    <div className="rounded-xl bg-white px-3 py-2">Logins: {member.loginCount30d}</div>
                    <div className="rounded-xl bg-white px-3 py-2">Updates: {member.totalActions30d}</div>
                    <div className="rounded-xl bg-white px-3 py-2">Check-ins: {member.checkInCount30d}</div>
                    <div className="rounded-xl bg-white px-3 py-2">Vendor days: {member.vendorDayCount30d}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-3">
              <p className="text-[14px] font-semibold uppercase tracking-wide text-[#7a7f89]">Recent Activity</p>
              {(teamActivity?.recentEvents ?? []).length === 0 ? <p className="mt-2 text-[14px] text-[#666b75]">No recent activity yet.</p> : null}
              <div className="mt-2 space-y-2">
                {(teamActivity?.recentEvents ?? []).slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[14px] font-medium text-[#1d1f23]">{event.actor}</p>
                    <p className="text-[13px] text-[#4f5661]">{event.title}</p>
                    {event.detail ? <p className="mt-1 text-[12px] text-[#7a7f89]">{event.detail}</p> : null}
                    <p className="mt-1 text-[12px] text-[#7a7f89]">{new Date(event.happenedAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
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
