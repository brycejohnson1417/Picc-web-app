'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';

type EligibleStore = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  licensedLocationId: string | null;
  daysSinceLastVendorDay: number | null;
};

export default function RequestVendorDayPage() {
  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [query, setQuery] = useState('');
  const [accountId, setAccountId] = useState('');
  const [requestedStart, setRequestedStart] = useState('');
  const [alternateStart, setAlternateStart] = useState('');
  const [pennyBundleRequested, setPennyBundleRequested] = useState(true);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/vendor-days/public-request', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error ?? 'Failed to load eligible stores');
        }
        setStores(json.stores ?? []);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load eligible stores');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const filteredStores = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return stores;
    return stores.filter((store) =>
      [store.name, store.city, store.state, store.licensedLocationId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, stores]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitted(false);
    try {
      const response = await fetch('/api/vendor-days/public-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          requestedStart: new Date(requestedStart).toISOString(),
          alternateStart: alternateStart ? new Date(alternateStart).toISOString() : null,
          pennyBundleRequested,
          notes,
          honeypot: '',
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error ?? 'Unable to submit request');
      }
      setSubmitted(true);
      setAccountId('');
      setRequestedStart('');
      setAlternateStart('');
      setPennyBundleRequested(true);
      setNotes('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit request');
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f6f8_0%,#eef2f6_100%)] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c93412]">PICC Internal Platform</p>
          <h1 className="text-4xl font-bold text-[#17181c]">Create a store vendor day request</h1>
          <p className="max-w-2xl text-sm text-[#5f6672]">
            Internal users can submit a store request into the dispatch queue here. This domain is internal-only; stores do not get a public request flow on `piccnewyork.org`.
          </p>
        </header>

        <Card className="border-[#d8d9de]">
          <CardHeader>
            <CardTitle>Store request form</CardTitle>
            <CardDescription>Only currently eligible stores appear here. Duplicate active requests are blocked automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Find your store</label>
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by store, city, or Licensed Location ID" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Eligible store</label>
                <select
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  disabled={loading}
                >
                  <option value="">{loading ? 'Loading stores…' : 'Select your store'}</option>
                  {filteredStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} {store.city ? `· ${store.city}, ${store.state ?? ''}` : ''} {store.daysSinceLastVendorDay != null ? `· ${store.daysSinceLastVendorDay} days since last VD` : '· first vendor day'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Preferred date and time</label>
                  <Input type="datetime-local" value={requestedStart} onChange={(event) => setRequestedStart(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Alternate date and time</label>
                  <Input type="datetime-local" value={alternateStart} onChange={(event) => setAlternateStart(event.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={pennyBundleRequested} onChange={(event) => setPennyBundleRequested(event.target.checked)} />
                We agree to run the Penny Bundle promo if approved for this vendor day.
              </label>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Notes</label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Store contact notes, preferred time details, staffing constraints, or event context." />
              </div>
              <Button type="submit" disabled={!accountId || !requestedStart}>
                Submit vendor day request
              </Button>
              {submitted ? <p className="text-sm text-[#1b7b4b]">Request submitted. PICC will review and match the best-fit BA.</p> : null}
              {error ? <p className="text-sm text-[#b3391b]">{error}</p> : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
