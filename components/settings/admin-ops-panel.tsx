'use client';

import { useEffect, useState } from 'react';
import { AccountIdentityType } from '@prisma/client';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import { useAppAccess } from '@/components/auth/app-access-provider';

type PolicyPayload = {
  currentPolicy: {
    values: {
      cooldownDays: number;
      standardEventDurationHours: number;
      offerWindowHours: number;
      eventPayRateDollars: number;
      travelPayRateDollars: number;
      oneWayTravelThresholdMinutes: number;
      passOffCutoffHours: number;
      noShowGracePeriodMinutes: number;
    };
  };
  policyHistory: Array<{
    id: string;
    createdAt: string;
    createdByEmail: string | null;
    reason: string | null;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    createdAt: string;
  }>;
};

type IdentityPayload = {
  identityOverrides: Array<{
    id: string;
    identityType: AccountIdentityType;
    identityValue: string;
    account: {
      name: string;
    } | null;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    licensedLocationId: string | null;
    licenseNumber: string;
  }>;
};

export function AdminOpsPanel() {
  const access = useAppAccess();
  const [policy, setPolicy] = useState<PolicyPayload | null>(null);
  const [identity, setIdentity] = useState<IdentityPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [identityType, setIdentityType] = useState<AccountIdentityType>(AccountIdentityType.LICENSED_LOCATION_ID);
  const [identityValue, setIdentityValue] = useState('');
  const [reason, setReason] = useState('');
  const [policyDraft, setPolicyDraft] = useState({
    cooldownDays: '60',
    standardEventDurationHours: '3',
    offerWindowHours: '4',
    eventPayRateDollars: '50',
    travelPayRateDollars: '25',
    oneWayTravelThresholdMinutes: '60',
    passOffCutoffHours: '12',
    noShowGracePeriodMinutes: '30',
  });

  const canSeePanel = access.role === 'ADMIN' || access.role === 'OPS_TEAM' || access.role === 'FINANCE';
  const canEditPolicy = access.role === 'ADMIN';

  useEffect(() => {
    if (!canSeePanel) return;
    void (async () => {
      try {
        const [policyResponse, identityResponse] = await Promise.all([
          fetch('/api/settings/policies', { cache: 'no-store' }),
          fetch('/api/settings/account-identity', { cache: 'no-store' }),
        ]);
        const policyJson = await policyResponse.json().catch(() => ({}));
        const identityJson = await identityResponse.json().catch(() => ({}));
        if (!policyResponse.ok && access.role === 'ADMIN') {
          throw new Error(policyJson.error ?? 'Failed to load policy data');
        }
        if (!identityResponse.ok) {
          throw new Error(identityJson.error ?? 'Failed to load identity data');
        }
        if (policyResponse.ok) {
          setPolicy(policyJson);
          setPolicyDraft({
            cooldownDays: String(policyJson.currentPolicy.values.cooldownDays ?? 60),
            standardEventDurationHours: String(policyJson.currentPolicy.values.standardEventDurationHours ?? 3),
            offerWindowHours: String(policyJson.currentPolicy.values.offerWindowHours ?? 4),
            eventPayRateDollars: String(policyJson.currentPolicy.values.eventPayRateDollars ?? 50),
            travelPayRateDollars: String(policyJson.currentPolicy.values.travelPayRateDollars ?? 25),
            oneWayTravelThresholdMinutes: String(policyJson.currentPolicy.values.oneWayTravelThresholdMinutes ?? 60),
            passOffCutoffHours: String(policyJson.currentPolicy.values.passOffCutoffHours ?? 12),
            noShowGracePeriodMinutes: String(policyJson.currentPolicy.values.noShowGracePeriodMinutes ?? 30),
          });
        }
        setIdentity(identityJson);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to load admin controls');
      } finally {
      }
    })();
  }, [access.role, canSeePanel]);

  if (!canSeePanel) return null;

  async function savePolicy() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooldownDays: Number(policyDraft.cooldownDays),
          standardEventDurationHours: Number(policyDraft.standardEventDurationHours),
          offerWindowHours: Number(policyDraft.offerWindowHours),
          eventPayRateDollars: Number(policyDraft.eventPayRateDollars),
          travelPayRateDollars: Number(policyDraft.travelPayRateDollars),
          oneWayTravelThresholdMinutes: Number(policyDraft.oneWayTravelThresholdMinutes),
          passOffCutoffHours: Number(policyDraft.passOffCutoffHours),
          noShowGracePeriodMinutes: Number(policyDraft.noShowGracePeriodMinutes),
          reason: reason || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? 'Failed to save policy snapshot');
      setMessage('Policy snapshot saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save policy snapshot');
    } finally {
      setSaving(false);
    }
  }

  async function saveIdentityOverride() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/account-identity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          identityType,
          identityValue,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? 'Failed to save identity override');
      setMessage('Identity override saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save identity override');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-[#c7c8ce] bg-[#f4f5f8] px-4 py-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#24324f]">Admin Controls</p>
        <h2 className="mt-1 text-[22px] font-semibold text-[#1d1f23]">Policy snapshots, changelog, and identity overrides</h2>
      </div>
      {message ? <div className="rounded-2xl border border-[#d7dbe3] bg-white px-4 py-3 text-[14px] text-[#24324f]">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {access.role === 'ADMIN' ? (
          <Card className="border-[#d6dae2]">
            <CardHeader>
              <CardTitle>Policy Controls</CardTitle>
              <CardDescription>Admin-only business defaults with changelog snapshots.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Input value={policyDraft.cooldownDays} onChange={(event) => setPolicyDraft({ ...policyDraft, cooldownDays: event.target.value })} placeholder="Cooldown days" />
                <Input value={policyDraft.standardEventDurationHours} onChange={(event) => setPolicyDraft({ ...policyDraft, standardEventDurationHours: event.target.value })} placeholder="Standard duration" />
                <Input value={policyDraft.offerWindowHours} onChange={(event) => setPolicyDraft({ ...policyDraft, offerWindowHours: event.target.value })} placeholder="Offer window hours" />
                <Input value={policyDraft.eventPayRateDollars} onChange={(event) => setPolicyDraft({ ...policyDraft, eventPayRateDollars: event.target.value })} placeholder="Event pay" />
                <Input value={policyDraft.travelPayRateDollars} onChange={(event) => setPolicyDraft({ ...policyDraft, travelPayRateDollars: event.target.value })} placeholder="Travel pay" />
                <Input value={policyDraft.oneWayTravelThresholdMinutes} onChange={(event) => setPolicyDraft({ ...policyDraft, oneWayTravelThresholdMinutes: event.target.value })} placeholder="Travel threshold min" />
                <Input value={policyDraft.passOffCutoffHours} onChange={(event) => setPolicyDraft({ ...policyDraft, passOffCutoffHours: event.target.value })} placeholder="Pass-off cutoff" />
                <Input value={policyDraft.noShowGracePeriodMinutes} onChange={(event) => setPolicyDraft({ ...policyDraft, noShowGracePeriodMinutes: event.target.value })} placeholder="No-show grace min" />
              </div>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for policy change" />
              <Button type="button" onClick={() => void savePolicy()} disabled={saving || !canEditPolicy}>
                {saving ? 'Saving…' : 'Save Policy Snapshot'}
              </Button>
              <div className="space-y-2">
                {(policy?.policyHistory ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-[#d9dee7] bg-[#fafbfd] px-3 py-2 text-[13px] text-[#4f5661]">
                    <p className="font-semibold text-[#1d1f23]">{new Date(entry.createdAt).toLocaleString()}</p>
                    <p>{entry.createdByEmail ?? 'System'}{entry.reason ? ` · ${entry.reason}` : ''}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-[#d6dae2]">
          <CardHeader>
            <CardTitle>Identity Overrides</CardTitle>
            <CardDescription>Fix bad source mappings once and keep ROI/reporting aligned.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <select
              className="h-11 rounded-xl border border-[#c9d0dc] bg-white px-3 text-[15px]"
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              <option value="">Select account</option>
              {(identity?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} {account.licensedLocationId ? `· ${account.licensedLocationId}` : ''}
                </option>
              ))}
            </select>
            <select
              className="h-11 rounded-xl border border-[#c9d0dc] bg-white px-3 text-[15px]"
              value={identityType}
              onChange={(event) => setIdentityType(event.target.value as AccountIdentityType)}
            >
              {Object.values(AccountIdentityType).map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <Input value={identityValue} onChange={(event) => setIdentityValue(event.target.value)} placeholder="Override value" />
            <Button type="button" onClick={() => void saveIdentityOverride()} disabled={saving || !selectedAccountId || !identityValue.trim()}>
              {saving ? 'Saving…' : 'Save Identity Override'}
            </Button>
            <div className="space-y-2">
              {(identity?.identityOverrides ?? []).map((override) => (
                <div key={override.id} className="rounded-xl border border-[#d9dee7] bg-[#fafbfd] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[#1d1f23]">{override.account?.name ?? 'Unassigned account'}</p>
                    <Badge variant="outline">{override.identityType.replaceAll('_', ' ')}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-[#4f5661]">{override.identityValue}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
