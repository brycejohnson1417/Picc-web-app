'use client';

import { ExternalLink, LoaderCircle, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import type { SamplePreview } from '@/lib/order-samples/plan';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function FirstOrderSamplesPanel({ accountId }: { accountId: string }) {
  const [preview, setPreview] = useState<SamplePreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<'reviewing' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ added: number; order: SamplePreview['order'] } | null>(null);
  const endpoint = `/api/accounts/${encodeURIComponent(accountId)}/first-order-samples`;
  const quantity = preview?.lines.reduce((total, line) => total + (selected.includes(line.productId) ? line.quantity : 0), 0) ?? 0;
  const order = saved?.order ?? preview?.order;

  async function review() {
    setStatus('reviewing');
    setError(null);
    setSaved(null);
    setPreview(null);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Distru review failed.');
      const result = payload as SamplePreview;
      setPreview(result);
      setSelected(result.lines.map(line => line.productId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Distru review failed.');
    } finally {
      setStatus(null);
    }
  }

  async function apply() {
    if (!preview?.fingerprint || !selected.length) return;
    setStatus('saving');
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fingerprint: preview.fingerprint, productIds: selected }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The Distru update could not be verified.');
      setSaved(payload);
      setPreview(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The Distru update could not be verified.');
      setPreview({ ...preview, fingerprint: undefined });
    } finally {
      setStatus(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">First-order samples</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {order ? (
          <div className="flex flex-wrap items-center gap-2">
            {order.url ? <a className="inline-flex items-center gap-1 font-semibold underline underline-offset-4" href={order.url} target="_blank" rel="noreferrer">{order.number}<ExternalLink className="size-3" aria-hidden="true" /></a> : <span className="font-semibold">{order.number}</span>}
            <Badge variant="outline" className="capitalize">{order.status}</Badge>
            <span className="text-muted-foreground">Distru · {order.date.slice(0, 10)}</span>
          </div>
        ) : null}

        {error ? <p role="alert" className="rounded-md border border-destructive/30 px-3 py-2 text-destructive">{error}</p> : null}
        {saved ? <p role="status" className="rounded-md border px-3 py-2 font-medium">Verified in Distru · {saved.added} {saved.added === 1 ? 'unit' : 'units'} added</p> : null}
        {preview?.reason ? <p role="status" className="text-muted-foreground">{preview.reason}</p> : null}

        {preview?.lines.length ? (
          <fieldset disabled={Boolean(status) || !preview.fingerprint} className="space-y-2">
            <legend className="mb-2 font-medium">Review additions · {currency.format(preview.unitPriceCents / 100)} per unit · Sample checked</legend>
            {preview.lines.map(line => (
              <label key={line.productId} className="flex min-h-11 items-start gap-2 rounded-md border px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={selected.includes(line.productId)}
                  onChange={event => setSelected(ids => event.target.checked ? [...ids, line.productId] : ids.filter(id => id !== line.productId))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block [overflow-wrap:anywhere]">{line.name}</span>
                  <span className="block text-xs text-muted-foreground">{line.sku} · {line.reason} · {line.availableUnits} available</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">× {line.quantity}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {preview?.skipped.length ? (
          <details className="text-muted-foreground">
            <summary className="cursor-pointer">Skipped ({preview.skipped.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{preview.skipped.map(note => <li key={note}>{note}</li>)}</ul>
          </details>
        ) : null}

        {preview?.fingerprint ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <span className="tabular-nums">{quantity} {quantity === 1 ? 'unit' : 'units'} · {currency.format(quantity * preview.unitPriceCents / 100)}</span>
            <Button type="button" className="min-h-11" onClick={apply} disabled={Boolean(status) || !quantity}>
              {status === 'saving' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {status === 'saving' ? 'Verifying save…' : 'Confirm and add to order'}
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={preview || saved ? 'outline' : 'default'} className="min-h-11" onClick={review} disabled={Boolean(status)}>
            {status === 'reviewing' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <PackagePlus aria-hidden="true" />}
            {status === 'reviewing' ? 'Checking Distru…' : preview || saved ? 'Refresh review' : 'Review first-order samples'}
          </Button>
          {preview ? <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setPreview(null); setError(null); }} disabled={Boolean(status)}>Cancel</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}
