'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';

type MembershipItem = {
  id: string;
  clerkUserId: string;
  role: 'ADMIN' | 'OPS_TEAM' | 'SALES_REP' | 'FINANCE' | 'BRAND_AMBASSADOR';
  source: string;
  active: boolean;
};

type IntegrationItem = {
  id: string;
  name: string;
  provider: 'NOTION' | 'GOOGLE_SHEETS' | 'GMAIL' | 'GHL';
  status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';
  enabled: boolean;
};

const roleOptions: MembershipItem['role'][] = ['ADMIN', 'OPS_TEAM', 'SALES_REP', 'FINANCE', 'BRAND_AMBASSADOR'];

export function SettingsClient({
  initialMemberships,
  initialIntegrations,
}: {
  initialMemberships: MembershipItem[];
  initialIntegrations: IntegrationItem[];
}) {
  const [memberships, setMemberships] = useState(initialMemberships);
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [savingMembershipId, setSavingMembershipId] = useState<string | null>(null);
  const [savingIntegrationId, setSavingIntegrationId] = useState<string | null>(null);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipItem['role']>('SALES_REP');
  const [inviting, setInviting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function updateMembership(membershipId: string, payload: { role?: MembershipItem['role']; active?: boolean }) {
    setSavingMembershipId(membershipId);
    try {
      const response = await fetch(`/api/settings/memberships/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error ?? 'Failed to update membership');
      }

      setMemberships((current) => current.map((member) => (member.id === membershipId ? { ...member, ...result } : member)));
      toast.success('Membership updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update membership');
    } finally {
      setSavingMembershipId(null);
    }
  }

  async function inviteMember() {
    if (!inviteUserId.trim()) {
      toast.error('User ID is required');
      return;
    }

    setInviting(true);
    try {
      const response = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkUserId: inviteUserId.trim(), role: inviteRole }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error ?? 'Failed to invite member');
      }

      setMemberships((current) => {
        const exists = current.some((member) => member.id === result.id);
        if (exists) {
          return current.map((member) => (member.id === result.id ? result : member));
        }
        return [result, ...current];
      });
      setInviteUserId('');
      setInviteRole('SALES_REP');
      toast.success('Member invited');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  }

  async function syncNotionDirectory() {
    setSyncing(true);
    try {
      const response = await fetch('/api/integrations/notion/sync-team-directory', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error ?? 'Failed to sync team directory');
      }
      toast.success(`Notion team sync complete (${result.synced ?? 0} memberships)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sync team directory');
    } finally {
      setSyncing(false);
    }
  }

  async function updateIntegration(integrationId: string, payload: { enabled?: boolean; status?: IntegrationItem['status'] }) {
    setSavingIntegrationId(integrationId);
    try {
      const response = await fetch(`/api/settings/integrations/${integrationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error ?? 'Failed to update integration');
      }

      setIntegrations((current) => current.map((integration) => (integration.id === integrationId ? { ...integration, ...result } : integration)));
      toast.success('Integration updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update integration');
    } finally {
      setSavingIntegrationId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-sm text-slate-500">Manage roles, invites, sync jobs, and integration toggles.</p>
        </div>
        <Button onClick={syncNotionDirectory} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Team Directory'}</Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Invite User</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input value={inviteUserId} onChange={(event) => setInviteUserId(event.target.value)} placeholder="clerk_user_id" />
          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as MembershipItem['role'])} className="h-11 rounded-md border bg-white px-3 text-sm">
            {roleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <Button onClick={inviteMember} disabled={inviting}>{inviting ? 'Inviting...' : 'Invite'}</Button>
        </CardContent>
      </Card>

      <Card id="team-roles">
        <CardHeader>
          <CardTitle>Team Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {memberships.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-semibold">{member.clerkUserId}</p>
                <p className="text-xs text-slate-500">Source: {member.source}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(event) => updateMembership(member.id, { role: event.target.value as MembershipItem['role'] })}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                  disabled={savingMembershipId === member.id}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant={member.active ? 'secondary' : 'outline'}
                  onClick={() => updateMembership(member.id, { active: !member.active })}
                  disabled={savingMembershipId === member.id}
                >
                  {member.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Badge variant={member.active ? 'success' : 'secondary'}>{member.active ? 'ACTIVE' : 'INACTIVE'}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card id="integrations">
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {integrations.map((integration) => (
            <div key={integration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-semibold">{integration.name}</p>
                <p className="text-xs text-slate-500">Provider: {integration.provider}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={integration.status}
                  onChange={(event) => updateIntegration(integration.id, { status: event.target.value as IntegrationItem['status'] })}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                  disabled={savingIntegrationId === integration.id}
                >
                  <option value="IDLE">IDLE</option>
                  <option value="RUNNING">RUNNING</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="ERROR">ERROR</option>
                </select>
                <Button
                  size="sm"
                  variant={integration.enabled ? 'secondary' : 'outline'}
                  onClick={() => updateIntegration(integration.id, { enabled: !integration.enabled })}
                  disabled={savingIntegrationId === integration.id}
                >
                  {integration.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Badge variant={integration.status === 'SUCCESS' ? 'success' : integration.status === 'ERROR' ? 'danger' : 'secondary'}>
                  {integration.status}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
