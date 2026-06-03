'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Mail, Shield, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { RoleSwitcher } from '@/components/layout/role-switcher';
import { WorkspacePanel, WorkspacePanelHeader } from '@/components/layout/workspace-page';
import { AdminOpsPanel } from '@/components/settings/admin-ops-panel';
import { NabisSyncAdminPanel } from '@/components/settings/nabis-sync-admin-panel';
import { GoogleUsageBudgetCard } from '@/components/territory/google-usage-budget-card';
import { Button, Input, Textarea } from '@/components/ui';
import { RoleDisplayNames } from '@/lib/types/rbac';

type SettingsSection = {
  id: string;
  label: string;
  description: string;
};

type TeamMemberSummary = {
  id: string;
  displayName: string;
  email: string | null;
  role: string | null;
  lastInteractionAt: string | null;
  interactionCount30d: number;
  clickCount30d: number;
  keydownCount30d: number;
  pageViewCount30d: number;
  activeDays30d: number;
  activeMinutes30d: number;
};

type TeamInteractionRecord = {
  id: string;
  happenedAt: string;
  actor: string;
  action: 'click' | 'keydown' | 'navigation';
  label: string;
  detail: string | null;
  path: string | null;
};

interface TeamActivityResponse {
  teamMembers: TeamMemberSummary[];
  recentInteractions: TeamInteractionRecord[];
  meta: {
    windowDays: number;
    teamMemberCount: number;
  };
}

interface TeamActivityDetailResponse {
  member: TeamMemberSummary | null;
  recentInteractions: TeamInteractionRecord[];
  topPages: Array<{
    path: string;
    count: number;
  }>;
}

interface TestModeResponse {
  testModeEnabled: boolean;
}

interface GuestInviteRecord {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  note: string | null;
  invitedByEmail: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  inviteLink: string;
}

interface GuestInvitesResponse {
  invites: GuestInviteRecord[];
}

interface OperationalInviteRecord {
  id: string;
  email: string;
  role: 'ADMIN' | 'OPS_TEAM' | 'SALES_REP' | 'FINANCE' | 'BRAND_AMBASSADOR' | 'GUEST_VIEWER';
  active: boolean;
  note: string | null;
  invitedByEmail: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  inviteLink: string;
}

interface OperationalInvitesResponse {
  invites: OperationalInviteRecord[];
}

function scrollToSection(id: string, smooth = true) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  window.history.replaceState(null, '', `#${id}`);
}

function formatRoleLabel(role: string | null | undefined) {
  if (!role) return 'Unassigned';
  return RoleDisplayNames[role as keyof typeof RoleDisplayNames] ?? role.replaceAll('_', ' ');
}

function formatTimestamp(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

export function SettingsMobile({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const appAccess = useAppAccess();
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const canViewTeamActivity = appAccess.role === 'ADMIN' || appAccess.role === 'OPS_TEAM';
  const canViewAdminControls = appAccess.role === 'ADMIN' || appAccess.role === 'OPS_TEAM' || appAccess.role === 'FINANCE';
  const [teamActivity, setTeamActivity] = useState<TeamActivityResponse | null>(null);
  const [loadingTeamActivity, setLoadingTeamActivity] = useState(true);
  const [teamActivityError, setTeamActivityError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDetails, setMemberDetails] = useState<Record<string, TeamActivityDetailResponse>>({});
  const [memberDetailErrors, setMemberDetailErrors] = useState<Record<string, string | null>>({});
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null);
  const [testModeEnabled, setTestModeEnabled] = useState(appAccess.testModeEnabled);
  const [updatingTestMode, setUpdatingTestMode] = useState(false);
  const [loadingAdminAccess, setLoadingAdminAccess] = useState(appAccess.isAdmin);
  const [guestInvites, setGuestInvites] = useState<GuestInviteRecord[]>([]);
  const [operationalInvites, setOperationalInvites] = useState<OperationalInviteRecord[]>([]);
  const [guestInviteError, setGuestInviteError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [operationalInviteEmail, setOperationalInviteEmail] = useState('');
  const [operationalInviteRole, setOperationalInviteRole] = useState<OperationalInviteRecord['role']>('SALES_REP');
  const [operationalInviteNote, setOperationalInviteNote] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [submittingOperationalInvite, setSubmittingOperationalInvite] = useState(false);
  const [updatingInviteId, setUpdatingInviteId] = useState<string | null>(null);

  const latestInvite = useMemo(() => guestInvites[0] ?? null, [guestInvites]);

  const settingsSections = useMemo<SettingsSection[]>(
    () =>
      [
        {
          id: 'profile-access',
          label: 'Profile & Access',
          description: 'Current role, role switching, support, and sign-out.',
        },
        {
          id: 'access-usage',
          label: 'Access & Usage',
          description: 'Usage budget, connected services, and workspace health.',
        },
        ...(canViewTeamActivity
          ? [
              {
                id: 'team-activity',
                label: 'Team Activity',
                description: 'Recorded clicks, key presses, page views, and advanced drill-downs.',
              },
            ]
          : []),
        ...(appAccess.isAdmin
          ? [
              {
                id: 'team-access',
                label: 'Admin Preview & Invites',
                description: 'Test mode, guest access, and operational invites.',
              },
            ]
          : []),
        ...(canViewAdminControls
          ? [
              {
                id: 'nabis-sync',
                label: 'Nabis Sync',
                description: 'Freshness, cached coverage, manual refreshes, and backfill readiness.',
              },
              {
                id: 'admin-controls',
                label: 'Admin Controls',
                description: 'Policy snapshots and identity overrides.',
              },
            ]
          : []),
      ] satisfies SettingsSection[],
    [appAccess.isAdmin, canViewAdminControls, canViewTeamActivity],
  );

  useEffect(() => {
    const hash = window.location.hash.replace('#', '').trim();
    if (!hash) return;
    const timeoutId = window.setTimeout(() => {
      scrollToSection(hash, false);
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!canViewTeamActivity) {
      setLoadingTeamActivity(false);
      return;
    }

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
  }, [canViewTeamActivity]);

  useEffect(() => {
    if (!selectedMemberId || !canViewTeamActivity || memberDetails[selectedMemberId]) {
      return;
    }

    const controller = new AbortController();

    const loadMemberDetail = async () => {
      setLoadingMemberId(selectedMemberId);
      setMemberDetailErrors((current) => ({ ...current, [selectedMemberId]: null }));
      try {
        const response = await fetch(`/api/settings/team-activity?memberId=${encodeURIComponent(selectedMemberId)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Unable to load advanced details');
        }

        const payload = (await response.json()) as TeamActivityDetailResponse;
        setMemberDetails((current) => ({ ...current, [selectedMemberId]: payload }));
      } catch (error) {
        if (controller.signal.aborted) return;
        setMemberDetailErrors((current) => ({
          ...current,
          [selectedMemberId]: error instanceof Error ? error.message : 'Unable to load advanced details',
        }));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingMemberId((current) => (current === selectedMemberId ? null : current));
        }
      }
    };

    void loadMemberDetail();

    return () => controller.abort();
  }, [canViewTeamActivity, memberDetails, selectedMemberId]);

  useEffect(() => {
    if (!appAccess.isAdmin) {
      setLoadingAdminAccess(false);
      return;
    }

    const controller = new AbortController();

    const loadAdminAccess = async () => {
      setLoadingAdminAccess(true);
      setGuestInviteError(null);
      try {
        const [testModeResponse, guestInvitesResponse, operationalInvitesResponse] = await Promise.all([
          fetch('/api/settings/test-mode', {
            signal: controller.signal,
            cache: 'no-store',
          }),
          fetch('/api/settings/guest-invites', {
            signal: controller.signal,
            cache: 'no-store',
          }),
          fetch('/api/settings/operational-invites', {
            signal: controller.signal,
            cache: 'no-store',
          }),
        ]);

        if (!testModeResponse.ok) {
          const payload = await testModeResponse.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Unable to load test mode');
        }

        if (!guestInvitesResponse.ok) {
          const payload = await guestInvitesResponse.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Unable to load guest invites');
        }

        if (!operationalInvitesResponse.ok) {
          const payload = await operationalInvitesResponse.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Unable to load operational invites');
        }

        const testModePayload = (await testModeResponse.json()) as TestModeResponse;
        const guestInvitesPayload = (await guestInvitesResponse.json()) as GuestInvitesResponse;
        const operationalInvitesPayload = (await operationalInvitesResponse.json()) as OperationalInvitesResponse;

        if (!controller.signal.aborted) {
          setTestModeEnabled(Boolean(testModePayload.testModeEnabled));
          setGuestInvites(guestInvitesPayload.invites ?? []);
          setOperationalInvites(operationalInvitesPayload.invites ?? []);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setGuestInviteError(error instanceof Error ? error.message : 'Unable to load admin access settings');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingAdminAccess(false);
        }
      }
    };

    void loadAdminAccess();

    return () => controller.abort();
  }, [appAccess.isAdmin]);

  async function handleToggleTestMode() {
    if (!appAccess.isAdmin || updatingTestMode) return;

    const nextValue = !testModeEnabled;
    setUpdatingTestMode(true);
    try {
      const response = await fetch('/api/settings/test-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextValue }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to update test mode');
      }

      setTestModeEnabled(Boolean(payload?.testModeEnabled));
      router.refresh();
      toast.success(nextValue ? 'Test mode enabled for your admin account.' : 'Test mode disabled.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update test mode');
    } finally {
      setUpdatingTestMode(false);
    }
  }

  async function handleCreateGuestInvite() {
    if (!appAccess.isAdmin || submittingInvite) return;

    setSubmittingInvite(true);
    setGuestInviteError(null);
    try {
      const response = await fetch('/api/settings/guest-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          note: inviteNote || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to create guest invite');
      }

      const invite = payload?.invite as GuestInviteRecord;
      setGuestInvites((current) => [invite, ...current.filter((entry) => entry.id !== invite.id)]);
      setInviteEmail('');
      setInviteNote('');
      try {
        await navigator.clipboard.writeText(invite.inviteLink);
        toast.success('Guest invite created and invite link copied.');
      } catch {
        toast.success('Guest invite created.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create guest invite');
    } finally {
      setSubmittingInvite(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!appAccess.isAdmin || updatingInviteId) return;

    setUpdatingInviteId(inviteId);
    try {
      const response = await fetch('/api/settings/guest-invites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId,
          action: 'revoke',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to revoke guest invite');
      }

      setGuestInvites((current) =>
        current.map((invite) =>
          invite.id === inviteId
            ? {
                ...invite,
                status: 'REVOKED',
                revokedAt: new Date().toISOString(),
              }
            : invite,
        ),
      );
      toast.success('Guest invite revoked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke guest invite');
    } finally {
      setUpdatingInviteId(null);
    }
  }

  async function handleCreateOperationalInvite() {
    if (!appAccess.isAdmin || submittingOperationalInvite) return;

    setSubmittingOperationalInvite(true);
    setGuestInviteError(null);
    try {
      const response = await fetch('/api/settings/operational-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: operationalInviteEmail,
          role: operationalInviteRole,
          note: operationalInviteNote || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to create operational invite');
      }

      const invite = payload?.invite as OperationalInviteRecord;
      setOperationalInvites((current) => [invite, ...current.filter((entry) => entry.id !== invite.id)]);
      setOperationalInviteEmail('');
      setOperationalInviteRole('SALES_REP');
      setOperationalInviteNote('');
      try {
        await navigator.clipboard.writeText(invite.inviteLink);
        toast.success('Operational invite created and link copied.');
      } catch {
        toast.success('Operational invite created.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create operational invite');
    } finally {
      setSubmittingOperationalInvite(false);
    }
  }

  async function handleRevokeOperationalInvite(inviteId: string) {
    if (!appAccess.isAdmin || updatingInviteId) return;

    setUpdatingInviteId(inviteId);
    try {
      const response = await fetch('/api/settings/operational-invites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId,
          action: 'revoke',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to revoke operational invite');
      }

      setOperationalInvites((current) =>
        current.map((invite) =>
          invite.id === inviteId
            ? {
                ...invite,
                active: false,
                revokedAt: new Date().toISOString(),
              }
            : invite,
        ),
      );
      toast.success('Operational invite revoked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke operational invite');
    } finally {
      setUpdatingInviteId(null);
    }
  }

  function handleEmailOperationalInvite(invite: OperationalInviteRecord) {
    const subject = encodeURIComponent('PICC internal platform access');
    const body = encodeURIComponent(
      `You have been invited to access the PICC internal platform as ${invite.role.replaceAll('_', ' ')}.\n\nSign in here:\n${invite.inviteLink}${invite.note ? `\n\nNote:\n${invite.note}` : ''}`,
    );
    window.location.href = `mailto:${invite.email}?subject=${subject}&body=${body}`;
  }

  async function handleCopyInviteLink(inviteLink: string) {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Invite link copied.');
    } catch {
      toast.error('Unable to copy invite link.');
    }
  }

  function handleEmailInvite(invite: GuestInviteRecord) {
    const subject = encodeURIComponent('Guest access to piccnewyork.org');
    const body = encodeURIComponent(
      `You have been invited to view piccnewyork.org in read-only mode.\n\nSign in here:\n${invite.inviteLink}${invite.note ? `\n\nNote:\n${invite.note}` : ''}`,
    );
    window.location.href = `mailto:${invite.email}?subject=${subject}&body=${body}`;
  }

  return (
    <div className={embedded ? 'space-y-5' : 'min-h-[calc(100dvh-92px)] bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)] px-4 py-5'}>
      <section id="settings-index" className="scroll-mt-28">
        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            eyebrow="Settings Index"
            title="Put every working control inside one settings workspace."
            description="These links jump to the actual controls that are live in the app instead of the old shallow settings menu."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {settingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className="rounded-2xl border border-[#d6dbe4] bg-[#f7f9fc] px-4 py-4 text-left transition hover:border-[#9db8f7] hover:bg-white"
              >
                <p className="text-[16px] font-semibold text-[#18212d]">{section.label}</p>
                <p className="mt-2 text-sm text-[#5c6674]">{section.description}</p>
              </button>
            ))}
          </div>
        </WorkspacePanel>
      </section>

      <section id="profile-access" className="scroll-mt-28">
        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            eyebrow="Profile & Access"
            title="Role, support, and account controls"
            description="Role context no longer needs to live as noisy header chrome. Keep switching, support, and sign-out here."
          />
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Current Role</p>
              <p className="mt-2 text-[22px] font-semibold text-[#1d1f23]">{formatRoleLabel(appAccess.role)}</p>
              <p className="mt-2 text-sm text-[#5c6674]">
                {appAccess.isGuestViewer ? 'Read-only access is active for this profile.' : 'This profile can use the main internal workspace.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {appAccess.testModeEnabled ? (
                  <span className="rounded-full border border-[#d9a696] bg-[#fff2ec] px-3 py-1 text-[12px] font-semibold text-[#b33a1d]">Test Mode</span>
                ) : null}
                {appAccess.isGuestViewer ? (
                  <span className="rounded-full border border-[#b7c3dc] bg-[#edf3ff] px-3 py-1 text-[12px] font-semibold text-[#3559a9]">Read Only</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Available Views</p>
              {appAccess.availableRoles.length > 1 ? (
                <>
                  <p className="mt-2 text-sm text-[#5c6674]">Switch between the roles already granted to this account.</p>
                  <div className="mt-3">
                    <RoleSwitcher activeRole={appAccess.role} availableRoles={appAccess.availableRoles} />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[18px] font-semibold text-[#1d1f23]">1 assigned role</p>
                  <p className="mt-2 text-sm text-[#5c6674]">This account only has one live role grant right now, so there is nothing to switch yet.</p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Actions</p>
              <div className="mt-3 grid gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="justify-start"
                  onClick={() => {
                    window.open('mailto:support@picc.co?subject=PICC%20Support', '_blank', 'noopener,noreferrer');
                  }}
                >
                  Support
                </Button>
                {hasClerk ? <ClerkSettingsSignOutButton /> : <DemoSettingsSignOutButton />}
              </div>
            </div>
          </div>
        </WorkspacePanel>
      </section>

      <section id="access-usage" className="scroll-mt-28">
        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            eyebrow="Access & Usage"
            title="Budget and service health in one place"
            description="Keep workspace usage signals close to settings instead of hiding them behind a separate menu."
          />
          <GoogleUsageBudgetCard compact />
        </WorkspacePanel>
      </section>

      {canViewTeamActivity ? (
        <section id="team-activity" className="scroll-mt-28">
          <WorkspacePanel className="space-y-4">
            <WorkspacePanelHeader
              eyebrow="Team Activity"
              title="Recorded clicks, key presses, and page usage"
              description="This view is driven by interaction telemetry instead of login counts. Click a team member to open advanced details with timestamps."
            />

            {loadingTeamActivity ? <p className="text-sm text-[#5c6674]">Loading team activity…</p> : null}
            {teamActivityError ? <p className="text-sm text-[#a23b22]">{teamActivityError}</p> : null}

            {!loadingTeamActivity && !teamActivityError ? (
              <>
                <div className="space-y-3">
                  {(teamActivity?.teamMembers ?? []).map((member) => {
                    const expanded = selectedMemberId === member.id;
                    const detail = memberDetails[member.id];
                    const detailError = memberDetailErrors[member.id];

                    return (
                      <div key={member.id} className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedMemberId((current) => (current === member.id ? null : member.id))}
                          className="w-full text-left"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[18px] font-semibold text-[#1d1f23]">{member.displayName}</p>
                              <p className="mt-1 text-[13px] text-[#5c6674]">{member.email ?? member.id}</p>
                            </div>
                            <div className="text-right">
                              <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#304153]">{formatRoleLabel(member.role)}</span>
                              <p className="mt-2 text-[12px] text-[#5c6674]">{formatTimestamp(member.lastInteractionAt, 'No recorded usage yet')}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-xl bg-white px-3 py-2 text-[13px] text-[#38404d]">Interactions: {member.interactionCount30d}</div>
                            <div className="rounded-xl bg-white px-3 py-2 text-[13px] text-[#38404d]">Active min: {member.activeMinutes30d}</div>
                            <div className="rounded-xl bg-white px-3 py-2 text-[13px] text-[#38404d]">Active days: {member.activeDays30d}</div>
                            <div className="rounded-xl bg-white px-3 py-2 text-[13px] text-[#38404d]">Clicks: {member.clickCount30d}</div>
                            <div className="rounded-xl bg-white px-3 py-2 text-[13px] text-[#38404d]">Keys: {member.keydownCount30d}</div>
                            <div className="rounded-xl bg-white px-3 py-2 text-[13px] text-[#38404d]">Pages: {member.pageViewCount30d}</div>
                          </div>
                          <p className="mt-3 text-sm font-medium text-[#3559a9]">{expanded ? 'Hide advanced details' : 'Open advanced details'}</p>
                        </button>

                        {expanded ? (
                          <div className="mt-4 rounded-2xl border border-[#d6dae2] bg-white px-4 py-4">
                            {loadingMemberId === member.id ? <p className="text-sm text-[#5c6674]">Loading advanced details…</p> : null}
                            {detailError ? <p className="text-sm text-[#a23b22]">{detailError}</p> : null}
                            {!loadingMemberId && !detailError ? (
                              <>
                                {detail?.topPages.length ? (
                                  <div>
                                    <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Most Used Pages</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {detail.topPages.map((page) => (
                                        <span key={page.path} className="rounded-full bg-[#eef3fb] px-3 py-1 text-[12px] font-semibold text-[#304153]">
                                          {page.path} · {page.count}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                <div className="mt-4">
                                  <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Recent Interactions</p>
                                  {detail && detail.recentInteractions.length === 0 ? <p className="mt-2 text-sm text-[#5c6674]">No recorded interactions yet.</p> : null}
                                  <div className="mt-2 space-y-2">
                                    {(detail?.recentInteractions ?? []).slice(0, 24).map((event) => (
                                      <div key={event.id} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div>
                                            <p className="text-[14px] font-semibold text-[#1d1f23]">{event.label}</p>
                                            {event.detail ? <p className="mt-1 text-[13px] text-[#4f5661]">{event.detail}</p> : null}
                                            {event.path ? <p className="mt-1 text-[12px] text-[#6a7583]">{event.path}</p> : null}
                                          </div>
                                          <span className="text-[12px] text-[#6a7583]">{formatTimestamp(event.happenedAt, '—')}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <p className="mt-4 text-[12px] text-[#6a7583]">
                                  Character keys inside editable fields are recorded as key events without storing typed text.
                                </p>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Latest Recorded Interactions</p>
                  {(teamActivity?.recentInteractions ?? []).length === 0 ? <p className="mt-2 text-sm text-[#5c6674]">No interaction telemetry recorded yet.</p> : null}
                  <div className="mt-3 space-y-2">
                    {(teamActivity?.recentInteractions ?? []).slice(0, 12).map((event) => (
                      <div key={event.id} className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[14px] font-semibold text-[#1d1f23]">{event.actor}</p>
                            <p className="text-[13px] text-[#4f5661]">{event.label}</p>
                            {event.path ? <p className="mt-1 text-[12px] text-[#6a7583]">{event.path}</p> : null}
                          </div>
                          <span className="text-[12px] text-[#6a7583]">{formatTimestamp(event.happenedAt, '—')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </WorkspacePanel>
        </section>
      ) : null}

      {appAccess.isAdmin ? (
        <section id="team-access" className="scroll-mt-28">
          <WorkspacePanel className="space-y-4">
            <WorkspacePanelHeader
              eyebrow="Admin Preview & Invites"
              title="Preview mode, guest access, and operational invites"
              description="Keep admin-only preview controls and invite flows inside settings instead of a detached submenu."
            />

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-[#fff1ed] p-2 text-[#c93412]">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[16px] font-semibold text-[#1d1f23]">Admin Preview</p>
                    <p className="mt-1 text-[14px] text-[#666b75]">Turn on test mode to preview admin-only UI before it becomes live for the full team.</p>
                  </div>
                </div>
                <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${testModeEnabled ? 'bg-[#fff1ed] text-[#b3391b]' : 'bg-[#edf3ff] text-[#3559a9]'}`}>
                  {testModeEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <Button type="button" className="mt-4 h-11 w-full bg-[#cd3814] text-white hover:bg-[#b52f10]" onClick={handleToggleTestMode} disabled={updatingTestMode || loadingAdminAccess}>
                  {updatingTestMode ? 'Updating...' : testModeEnabled ? 'Disable Test Mode' : 'Enable Test Mode'}
                </Button>
              </div>

              <div className="rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-[#edf3ff] p-2 text-[#3559a9]">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[16px] font-semibold text-[#1d1f23]">Guest Access</p>
                    <p className="mt-1 text-[14px] text-[#666b75]">Invite read-only viewers without sending them into the main operator role flow.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="guest@example.com"
                    className="h-11 border-[#c6c8d0] text-[15px] text-[#1d1f23]"
                  />
                  <Textarea
                    value={inviteNote}
                    onChange={(event) => setInviteNote(event.target.value)}
                    placeholder="Optional note to include with the invite..."
                    className="min-h-[96px] border-[#c6c8d0] bg-white text-[15px] text-[#1d1f23] placeholder:text-[#7c8089]"
                  />
                  <Button
                    type="button"
                    className="h-11 w-full bg-[#24324f] text-white hover:bg-[#1c2840]"
                    onClick={handleCreateGuestInvite}
                    disabled={submittingInvite || !inviteEmail.trim()}
                  >
                    {submittingInvite ? 'Creating Invite...' : 'Create Guest Invite'}
                  </Button>
                  {latestInvite ? (
                    <div className="rounded-2xl border border-[#d6d8df] bg-white px-4 py-3">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Latest Invite</p>
                      <p className="mt-1 text-[15px] font-semibold text-[#1d1f23]">{latestInvite.email}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button type="button" variant="secondary" className="h-10" onClick={() => handleCopyInviteLink(latestInvite.inviteLink)}>
                          <Copy className="h-4 w-4" />
                          Copy Link
                        </Button>
                        <Button type="button" variant="secondary" className="h-10" onClick={() => handleEmailInvite(latestInvite)}>
                          <Mail className="h-4 w-4" />
                          Email Invite
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-[#eef8f1] p-2 text-[#20734a]">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[16px] font-semibold text-[#1d1f23]">Operational Access</p>
                    <p className="mt-1 text-[14px] text-[#666b75]">Invite reps, ops, or finance users into the active internal app roles.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <Input
                    type="email"
                    value={operationalInviteEmail}
                    onChange={(event) => setOperationalInviteEmail(event.target.value)}
                    placeholder="rep@example.com"
                    className="h-11 border-[#c6c8d0] text-[15px] text-[#1d1f23]"
                  />
                  <select
                    value={operationalInviteRole}
                    onChange={(event) => setOperationalInviteRole(event.target.value as OperationalInviteRecord['role'])}
                    className="h-11 w-full rounded-lg border border-[#c6c8d0] bg-white px-3 text-[15px] text-[#1d1f23]"
                  >
                    <option value="SALES_REP">Sales Rep</option>
                    <option value="OPS_TEAM">Ops Team</option>
                    <option value="FINANCE">Finance</option>
                  </select>
                  <Textarea
                    value={operationalInviteNote}
                    onChange={(event) => setOperationalInviteNote(event.target.value)}
                    placeholder="Optional onboarding note..."
                    className="min-h-[96px] border-[#c6c8d0] bg-white text-[15px] text-[#1d1f23] placeholder:text-[#7c8089]"
                  />
                  <Button
                    type="button"
                    className="h-11 w-full bg-[#1b5e3d] text-white hover:bg-[#184f35]"
                    onClick={handleCreateOperationalInvite}
                    disabled={submittingOperationalInvite || !operationalInviteEmail.trim()}
                  >
                    {submittingOperationalInvite ? 'Creating Invite...' : 'Create Operational Invite'}
                  </Button>
                </div>
              </div>
            </div>

            {guestInviteError ? <p className="text-sm text-[#a23b22]">{guestInviteError}</p> : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Guest Invites</p>
                {loadingAdminAccess ? <p className="mt-2 text-[14px] text-[#666b75]">Loading guest access…</p> : null}
                {!loadingAdminAccess && guestInvites.length === 0 ? <p className="mt-2 text-[14px] text-[#666b75]">No guest invites yet.</p> : null}
                <div className="mt-3 space-y-2">
                  {guestInvites.map((invite) => (
                    <div key={invite.id} className="rounded-2xl border border-[#d6d8df] bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold text-[#1d1f23]">{invite.email}</p>
                          <p className="mt-1 text-[13px] text-[#666b75]">
                            {invite.status === 'ACCEPTED'
                              ? `Accepted ${invite.acceptedAt ? new Date(invite.acceptedAt).toLocaleString() : ''}`.trim()
                              : invite.status === 'REVOKED'
                                ? `Revoked ${invite.revokedAt ? new Date(invite.revokedAt).toLocaleString() : ''}`.trim()
                                : `Pending since ${new Date(invite.createdAt).toLocaleString()}`}
                          </p>
                          {invite.note ? <p className="mt-2 text-[13px] text-[#4f5661]">{invite.note}</p> : null}
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${invite.status === 'ACCEPTED' ? 'bg-[#e8f7ee] text-[#25784e]' : invite.status === 'REVOKED' ? 'bg-[#f4f5f7] text-[#6d7380]' : 'bg-[#fff1ed] text-[#b3391b]'}`}>
                          {invite.status.toLowerCase()}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Button type="button" variant="secondary" className="h-10 text-[13px]" onClick={() => handleCopyInviteLink(invite.inviteLink)}>
                          Copy
                        </Button>
                        <Button type="button" variant="secondary" className="h-10 text-[13px]" onClick={() => handleEmailInvite(invite)}>
                          Email
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 text-[13px]"
                          onClick={() => handleRevokeInvite(invite.id)}
                          disabled={invite.status === 'REVOKED' || updatingInviteId === invite.id}
                        >
                          {updatingInviteId === invite.id ? '...' : 'Revoke'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Operational Invites</p>
                {!loadingAdminAccess && operationalInvites.length === 0 ? <p className="mt-2 text-[14px] text-[#666b75]">No operational invites yet.</p> : null}
                <div className="mt-3 space-y-2">
                  {operationalInvites.map((invite) => (
                    <div key={invite.id} className="rounded-2xl border border-[#d6d8df] bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold text-[#1d1f23]">{invite.email}</p>
                          <p className="mt-1 text-[13px] text-[#666b75]">{formatRoleLabel(invite.role)}</p>
                          <p className="mt-1 text-[13px] text-[#666b75]">
                            {invite.acceptedAt
                              ? `Accepted ${new Date(invite.acceptedAt).toLocaleString()}`
                              : invite.revokedAt
                                ? `Revoked ${new Date(invite.revokedAt).toLocaleString()}`
                                : `Pending since ${new Date(invite.createdAt).toLocaleString()}`}
                          </p>
                          {invite.note ? <p className="mt-2 text-[13px] text-[#4f5661]">{invite.note}</p> : null}
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${invite.revokedAt ? 'bg-[#f4f5f7] text-[#6d7380]' : invite.acceptedAt ? 'bg-[#e8f7ee] text-[#25784e]' : 'bg-[#eef8f1] text-[#20734a]'}`}>
                          {invite.revokedAt ? 'revoked' : invite.acceptedAt ? 'accepted' : 'pending'}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Button type="button" variant="secondary" className="h-10 text-[13px]" onClick={() => handleCopyInviteLink(invite.inviteLink)}>
                          Copy
                        </Button>
                        <Button type="button" variant="secondary" className="h-10 text-[13px]" onClick={() => handleEmailOperationalInvite(invite)}>
                          Email
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 text-[13px]"
                          onClick={() => handleRevokeOperationalInvite(invite.id)}
                          disabled={Boolean(invite.revokedAt) || updatingInviteId === invite.id}
                        >
                          {updatingInviteId === invite.id ? '...' : 'Revoke'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </WorkspacePanel>
        </section>
      ) : null}

      {canViewAdminControls ? (
        <section id="nabis-sync" className="scroll-mt-28">
          <NabisSyncAdminPanel />
        </section>
      ) : null}

      {canViewAdminControls ? (
        <section id="admin-controls" className="scroll-mt-28">
          <AdminOpsPanel embedded />
        </section>
      ) : null}
    </div>
  );
}

function DemoSettingsSignOutButton() {
  return (
    <Button type="button" variant="outline" className="justify-start" disabled>
      Sign Out
    </Button>
  );
}

function ClerkSettingsSignOutButton() {
  const { signOut } = useClerk();

  return (
    <Button
      type="button"
      variant="outline"
      className="justify-start"
      onClick={() => {
        signOut({ redirectUrl: '/sign-in' }).catch(() => {
          toast.error('Sign out failed. Please try again.');
        });
      }}
    >
      Sign Out
    </Button>
  );
}
