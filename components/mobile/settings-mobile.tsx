'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Copy, Mail, Shield, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { WorkspacePanel, WorkspacePanelHeader } from '@/components/layout/workspace-page';
import { Button, Input, Textarea } from '@/components/ui';
import { GoogleUsageBudgetCard } from '@/components/territory/google-usage-budget-card';

type SettingsLink = {
  label: string;
  value: string;
};

const settingsLinks: SettingsLink[] = [
  { label: 'Notion Connection', value: '/settings#integrations' },
  { label: 'Google API Budget', value: '/settings#google-budget' },
  { label: 'Team Access', value: '/settings#team-roles' },
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

export function SettingsMobile({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const appAccess = useAppAccess();
  const canViewTeamActivity = appAccess.role === 'ADMIN' || appAccess.role === 'OPS_TEAM';
  const [teamActivity, setTeamActivity] = useState<TeamActivityResponse | null>(null);
  const [loadingTeamActivity, setLoadingTeamActivity] = useState(true);
  const [teamActivityError, setTeamActivityError] = useState<string | null>(null);
  const [testModeEnabled, setTestModeEnabled] = useState(appAccess.testModeEnabled);
  const [updatingTestMode, setUpdatingTestMode] = useState(false);
  const [loadingAdminAccess, setLoadingAdminAccess] = useState(appAccess.isAdmin);
  const [guestInvites, setGuestInvites] = useState<GuestInviteRecord[]>([]);
  const [operationalInvites, setOperationalInvites] = useState<OperationalInviteRecord[]>([]);
  const [guestInviteError, setGuestInviteError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [operationalInviteEmail, setOperationalInviteEmail] = useState('');
  const [operationalInviteRole, setOperationalInviteRole] = useState<OperationalInviteRecord['role']>('BRAND_AMBASSADOR');
  const [operationalInviteNote, setOperationalInviteNote] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [submittingOperationalInvite, setSubmittingOperationalInvite] = useState(false);
  const [updatingInviteId, setUpdatingInviteId] = useState<string | null>(null);

  const latestInvite = useMemo(() => guestInvites[0] ?? null, [guestInvites]);

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
      setOperationalInviteRole('BRAND_AMBASSADOR');
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
    <div className={embedded ? 'space-y-5' : 'min-h-[calc(100dvh-92px)] bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)]'}>
      {embedded ? (
        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            eyebrow="Access and usage"
            title="Keep support controls and connected services in one place."
            description="This section stays inside the internal app frame and focuses on the controls operators actually need."
          />
          <GoogleUsageBudgetCard compact />
        </WorkspacePanel>
      ) : (
        <div className="border-y border-[#c7c8ce] bg-white px-4 py-3">
          <GoogleUsageBudgetCard compact />
        </div>
      )}
      {appAccess.isAdmin ? (
        <div className={embedded ? 'rounded-[24px] border border-[#d6dbe4] bg-white px-4 py-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]' : 'border-b border-[#c7c8ce] bg-white px-4 py-4'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[18px] font-semibold text-[#1d1f23]">Admin Preview</p>
              <p className="text-[14px] text-[#666b75]">Turn on test mode to preview admin-only UI before it becomes live for the full team.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${testModeEnabled ? 'bg-[#fff1ed] text-[#b3391b]' : 'bg-[#edf3ff] text-[#3559a9]'}`}>
              {testModeEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-[#fff1ed] p-2 text-[#c93412]">
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-[#1d1f23]">UI Test Mode</p>
                <p className="mt-1 text-[14px] text-[#666b75]">Use this on your admin account to verify preview-only features before the rest of the team sees them.</p>
              </div>
            </div>
            <Button type="button" className="mt-4 h-11 w-full bg-[#cd3814] text-white hover:bg-[#b52f10]" onClick={handleToggleTestMode} disabled={updatingTestMode || loadingAdminAccess}>
              {updatingTestMode ? 'Updating...' : testModeEnabled ? 'Disable Test Mode' : 'Enable Test Mode'}
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-[#edf3ff] p-2 text-[#3559a9]">
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-[#1d1f23]">Guest Access</p>
                <p className="mt-1 text-[14px] text-[#666b75]">Invite a guest to sign in with Google and use a read-only view of the app.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Guest Email</label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="guest@example.com"
                  className="h-11 border-[#c6c8d0] text-[15px] text-[#1d1f23]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Invite Note</label>
                <Textarea
                  value={inviteNote}
                  onChange={(event) => setInviteNote(event.target.value)}
                  placeholder="Optional note to include with the invite..."
                  className="min-h-[96px] border-[#c6c8d0] bg-white text-[15px] text-[#1d1f23] placeholder:text-[#7c8089]"
                />
              </div>
              <Button
                type="button"
                className="h-11 w-full bg-[#24324f] text-white hover:bg-[#1c2840]"
                onClick={handleCreateGuestInvite}
                disabled={submittingInvite || !inviteEmail.trim()}
              >
                {submittingInvite ? 'Creating Invite...' : 'Create Guest Invite'}
              </Button>
              {guestInviteError ? <p className="text-[13px] text-[#a23b22]">{guestInviteError}</p> : null}
            </div>

            {latestInvite ? (
              <div className="mt-4 rounded-2xl border border-[#d6d8df] bg-white px-4 py-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Latest Invite</p>
                <p className="mt-1 text-[15px] font-semibold text-[#1d1f23]">{latestInvite.email}</p>
                <p className="mt-1 text-[13px] text-[#666b75]">{latestInvite.inviteLink}</p>
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

            <div className="mt-4 space-y-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Guest Invites</p>
              {loadingAdminAccess ? <p className="text-[14px] text-[#666b75]">Loading guest access…</p> : null}
              {!loadingAdminAccess && guestInvites.length === 0 ? <p className="text-[14px] text-[#666b75]">No guest invites yet.</p> : null}
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

          <div className="mt-4 rounded-2xl border border-[#d5d7de] bg-[#f7f7fa] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-[#eef8f1] p-2 text-[#20734a]">
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-[#1d1f23]">Operational Access</p>
                <p className="mt-1 text-[14px] text-[#666b75]">Invite outsourced BAs or other non-company users into the internal app with a real operational role.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Operational Email</label>
                <Input
                  type="email"
                  value={operationalInviteEmail}
                  onChange={(event) => setOperationalInviteEmail(event.target.value)}
                  placeholder="ba@example.com"
                  className="h-11 border-[#c6c8d0] text-[15px] text-[#1d1f23]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Role</label>
                <select
                  value={operationalInviteRole}
                  onChange={(event) => setOperationalInviteRole(event.target.value as OperationalInviteRecord['role'])}
                  className="h-11 w-full rounded-lg border border-[#c6c8d0] bg-white px-3 text-[15px] text-[#1d1f23]"
                >
                  <option value="BRAND_AMBASSADOR">Brand Ambassador</option>
                  <option value="SALES_REP">Sales Rep</option>
                  <option value="OPS_TEAM">Ops Team</option>
                  <option value="FINANCE">Finance</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Invite Note</label>
                <Textarea
                  value={operationalInviteNote}
                  onChange={(event) => setOperationalInviteNote(event.target.value)}
                  placeholder="Optional onboarding note..."
                  className="min-h-[96px] border-[#c6c8d0] bg-white text-[15px] text-[#1d1f23] placeholder:text-[#7c8089]"
                />
              </div>
              <Button
                type="button"
                className="h-11 w-full bg-[#1b5e3d] text-white hover:bg-[#184f35]"
                onClick={handleCreateOperationalInvite}
                disabled={submittingOperationalInvite || !operationalInviteEmail.trim()}
              >
                {submittingOperationalInvite ? 'Creating Invite...' : 'Create Operational Invite'}
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Operational Invites</p>
              {!loadingAdminAccess && operationalInvites.length === 0 ? <p className="text-[14px] text-[#666b75]">No operational invites yet.</p> : null}
              {operationalInvites.map((invite) => (
                <div key={invite.id} className="rounded-2xl border border-[#d6d8df] bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-[#1d1f23]">{invite.email}</p>
                      <p className="mt-1 text-[13px] text-[#666b75]">{invite.role.replaceAll('_', ' ')}</p>
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
      ) : null}
      {canViewTeamActivity ? (
        <div className={embedded ? 'rounded-[24px] border border-[#d6dbe4] bg-white px-4 py-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]' : 'border-b border-[#c7c8ce] bg-white px-4 py-4'}>
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
      ) : null}
      <div className={embedded ? 'rounded-[24px] border border-[#d6dbe4] bg-white shadow-[0_16px_40px_rgba(24,33,45,0.08)]' : 'border-t border-[#c7c8ce] bg-white'}>
        <div className="border-b border-[#d6d8df] px-4 py-3">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Settings</p>
        </div>
        {settingsLinks.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              router.push(item.value);
            }}
            className="grid w-full grid-cols-[1fr_24px] items-center border-b border-[#c9cad0] px-5 py-4 text-left"
          >
            <span className="text-[23px] text-[#2a2c31]">{item.label}</span>
            <ChevronRight className="h-7 w-7 text-[#bcc0c7]" />
          </button>
        ))}
        <div className="border-b border-[#d6d8df] px-4 py-3">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7a7f89]">Support</p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.open('mailto:support@picc.co?subject=PICC%20Support', '_blank', 'noopener,noreferrer');
          }}
          className="grid w-full grid-cols-[1fr_24px] items-center border-b border-[#c9cad0] px-5 py-4 text-left"
        >
          <span className="text-[23px] text-[#2a2c31]">Support</span>
          <ChevronRight className="h-7 w-7 text-[#bcc0c7]" />
        </button>
        <button
          type="button"
          onClick={() => {
            signOut({ redirectUrl: '/sign-in' }).catch(() => {
              toast.error('Sign out failed. Please try again.');
            });
          }}
          className="grid w-full grid-cols-[1fr_24px] items-center px-5 py-4 text-left"
        >
          <span className="text-[23px] text-[#2a2c31]">Sign Out</span>
          <ChevronRight className="h-7 w-7 text-[#bcc0c7]" />
        </button>
      </div>
    </div>
  );
}
