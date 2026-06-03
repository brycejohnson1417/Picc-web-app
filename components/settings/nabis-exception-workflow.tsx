'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, FileText, PackagePlus, RefreshCw, Search, Send, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Input, Textarea } from '@/components/ui';
import { WorkspacePanel, WorkspacePanelHeader } from '@/components/layout/workspace-page';

type NabisExceptionOrderLine = {
  productName: string;
  quantity: number | null;
  isSample: boolean;
};

type NabisExceptionOrder = {
  id: string;
  orderNumber: string | null;
  externalOrderId?: string | null;
  orderCreatedDate: string | null;
  status?: string | null;
  salesRep?: string | null;
  poSoNumber?: string | null;
  orderTotal?: number | null;
  deliveryDate?: string | null;
  lines?: NabisExceptionOrderLine[];
};

type NabisExceptionRetailer = {
  id: string;
  accountId?: string | null;
  accountName: string;
  licensedLocationId: string | null;
  licenseNumber: string | null;
  nabisRetailerId: string | null;
  address?: string | null;
  lastOrderAt?: string | null;
  orderCount?: number;
  recentOrders?: NabisExceptionOrder[];
};

type NabisExceptionWorkspaceResponse = {
  retailers: NabisExceptionRetailer[];
  meta: {
    query: string;
    retailerCount: number;
    latestOrderCreatedAt: string | null;
    stale: boolean;
    staleAfterDays: number;
  };
};

type SampleLineDraft = {
  id: string;
  sku: string;
  productName: string;
  quantity: string;
  reason: string;
  notes: string;
};

type PreviewResponse = {
  preview: {
    subject: string;
    message: string;
    summary: {
      requestType: string;
      sampleLineCount: number;
      discrepancyCount: number;
      existingOrderLineCount: number;
    };
    payload: unknown;
  };
};

const emptySampleLine = (id = 'sample-1'): SampleLineDraft => ({
  id,
  sku: '',
  productName: '',
  quantity: '1',
  reason: 'Microbar sample addition',
  notes: '',
});

function formatDate(value: string | null | undefined, fallback = 'Not recorded') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
}

function formatCurrency(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : 'No total';
}

function orderLabel(order: NabisExceptionOrder | null | undefined) {
  if (!order) return 'No order selected';
  return order.orderNumber || order.externalOrderId || order.id;
}

export function NabisExceptionWorkflow() {
  const [query, setQuery] = useState('');
  const [workspace, setWorkspace] = useState<NabisExceptionWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sampleLines, setSampleLines] = useState<SampleLineDraft[]>([emptySampleLine()]);
  const [discrepancyText, setDiscrepancyText] = useState('');
  const [preview, setPreview] = useState<PreviewResponse['preview'] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selectedRetailer = useMemo(() => workspace?.retailers.find((retailer) => retailer.id === selectedRetailerId) ?? null, [selectedRetailerId, workspace?.retailers]);
  const selectedOrder = useMemo(
    () => selectedRetailer?.recentOrders?.find((order) => order.id === selectedOrderId) ?? selectedRetailer?.recentOrders?.[0] ?? null,
    [selectedOrderId, selectedRetailer?.recentOrders],
  );
  const validSampleLines = useMemo(
    () =>
      sampleLines
        .map((line) => ({
          sku: line.sku.trim(),
          productName: line.productName.trim(),
          quantity: Number.parseInt(line.quantity, 10),
          reason: line.reason.trim(),
          notes: line.notes.trim(),
        }))
        .filter((line) => line.sku && line.productName && Number.isFinite(line.quantity) && line.quantity > 0 && line.reason),
    [sampleLines],
  );
  const discrepancyNotes = useMemo(() => discrepancyText.split('\n').map((line) => line.trim()).filter(Boolean), [discrepancyText]);
  const canPreview = Boolean(selectedRetailer?.id && selectedOrder?.id && (validSampleLines.length > 0 || discrepancyNotes.length > 0));

  const loadWorkspace = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('query', query.trim());
        const response = await fetch(`/api/nabis/exceptions${params.size ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Unable to load Nabis exception workspace');
        }
        const nextWorkspace = payload as NabisExceptionWorkspaceResponse;
        setWorkspace(nextWorkspace);
        setSelectedRetailerId((current) => {
          if (current && nextWorkspace.retailers.some((retailer) => retailer.id === current)) return current;
          return nextWorkspace.retailers[0]?.id ?? null;
        });
        setPreview(null);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Unable to load Nabis exception workspace');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void loadWorkspace('initial');
  }, [loadWorkspace]);

  useEffect(() => {
    setSelectedOrderId(selectedRetailer?.recentOrders?.[0]?.id ?? null);
    setPreview(null);
  }, [selectedRetailer?.id, selectedRetailer?.recentOrders]);

  function updateSampleLine(id: string, key: keyof Omit<SampleLineDraft, 'id'>, value: string) {
    setSampleLines((current) => current.map((line) => (line.id === id ? { ...line, [key]: value } : line)));
    setPreview(null);
  }

  function removeSampleLine(id: string) {
    setSampleLines((current) => (current.length === 1 ? [emptySampleLine()] : current.filter((line) => line.id !== id)));
    setPreview(null);
  }

  async function handlePreview() {
    if (!selectedRetailer?.id || !selectedOrder?.id) {
      setPreviewError('Select a retailer and a cached Nabis order first.');
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    try {
      const response = await fetch('/api/nabis/exceptions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: selectedRetailer.id,
          orderId: selectedOrder.id,
          sampleLines: validSampleLines,
          discrepancyNotes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to generate Nabis exception preview');
      }
      setPreview((payload as PreviewResponse).preview);
      toast.success('Nabis exception preview generated.');
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to generate Nabis exception preview';
      setPreviewError(message);
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCopyPreview() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(`${preview.subject}\n\n${preview.message}`);
      toast.success('Nabis exception request copied.');
    } catch {
      toast.error('Unable to copy request.');
    }
  }

  return (
    <WorkspacePanel className="space-y-4">
      <WorkspacePanelHeader
        eyebrow="Nabis Exceptions"
        title="Microbar samples and order corrections"
        description="Select a retailer, anchor the request to the newest cached Nabis order, add sample SKUs or discrepancy notes, and preview the outbound exception request."
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#6a7583]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search retailer, license, or Nabis ID"
                  className="h-11 border-[#c9d0dc] pl-9 text-[15px]"
                  aria-label="Search Nabis retailers"
                />
              </div>
              <Button type="button" variant="secondary" onClick={() => void loadWorkspace('refresh')} disabled={loading || refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Loading' : 'Load'}
              </Button>
            </div>

            {workspace?.meta.stale ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#efd3a8] bg-[#fff8e8] px-3 py-2 text-sm text-[#8a5b05]">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>Cached order data may be stale. Latest cached order: {formatDate(workspace.meta.latestOrderCreatedAt)}.</span>
              </div>
            ) : null}

            {loading ? <p className="mt-3 text-sm text-[#5c6674]">Loading cached Nabis retailers and orders...</p> : null}
            {error ? <p className="mt-3 text-sm text-[#a23b22]">{error}</p> : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {(workspace?.retailers ?? []).map((retailer) => {
              const selected = retailer.id === selectedRetailerId;
              const newestOrder = retailer.recentOrders?.[0] ?? null;
              return (
                <button
                  key={retailer.id}
                  type="button"
                  onClick={() => setSelectedRetailerId(retailer.id)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    selected ? 'border-[#c93412] bg-[#fff5f1] shadow-[0_14px_34px_rgba(201,52,18,0.12)]' : 'border-[#d6dae2] bg-white hover:border-[#9db8f7] hover:bg-[#f7f9fc]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-semibold text-[#1d1f23]">{retailer.accountName}</p>
                      <p className="mt-1 text-[13px] text-[#5c6674]">{retailer.address || 'Address not cached'}</p>
                    </div>
                    {selected ? <CheckCircle2 className="h-5 w-5 text-[#c93412]" /> : <Store className="h-5 w-5 text-[#3559a9]" />}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">{retailer.licenseNumber || 'No license'}</Badge>
                    <Badge variant={newestOrder ? 'success' : 'warning'}>{newestOrder ? `Newest ${formatDate(newestOrder.orderCreatedDate)}` : 'No order'}</Badge>
                  </div>
                </button>
              );
            })}
          </div>

          {!loading && !error && (workspace?.retailers ?? []).length === 0 ? (
            <div className="rounded-2xl border border-[#d6dae2] bg-white px-4 py-6 text-sm text-[#5c6674]">
              No cached Nabis retailers matched this search. Refresh Nabis sync first if the retailer was recently added.
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-[#d6dae2] bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Selected Order</p>
                <p className="mt-1 text-[20px] font-semibold text-[#1d1f23]">{orderLabel(selectedOrder)}</p>
                <p className="mt-1 text-sm text-[#5c6674]">
                  {selectedRetailer ? selectedRetailer.accountName : 'Select a retailer'} · {formatDate(selectedOrder?.orderCreatedDate)}
                </p>
              </div>
              <Badge variant={selectedOrder ? 'success' : 'warning'}>{selectedOrder ? selectedOrder.status || 'cached' : 'missing'}</Badge>
            </div>

            {selectedRetailer?.recentOrders?.length ? (
              <div className="mt-4 grid gap-2">
                {selectedRetailer.recentOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setPreview(null);
                    }}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      order.id === selectedOrder?.id ? 'border-[#3559a9] bg-[#edf3ff]' : 'border-[#e0e5ee] bg-[#f8fafc] hover:border-[#b7c9ef]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-semibold text-[#1d1f23]">{orderLabel(order)}</p>
                        <p className="mt-1 text-[12px] text-[#5c6674]">{formatDate(order.orderCreatedDate)} · {formatCurrency(order.orderTotal)}</p>
                      </div>
                      <span className="text-[12px] font-semibold text-[#3559a9]">{order.lines?.length ?? 0} cached lines</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-[#efd3a8] bg-[#fff8e8] px-3 py-3 text-sm text-[#8a5b05]">
                This retailer has no cached Nabis orders available for exception handling.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[#d6dae2] bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Sample SKU Additions</p>
                <p className="mt-1 text-sm text-[#5c6674]">Add Microbar sample SKUs to request against the selected cached order.</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setSampleLines((current) => [...current, emptySampleLine(`sample-${Date.now()}`)])}>
                <PackagePlus className="h-4 w-4" />
                Add SKU
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {sampleLines.map((line, index) => (
                <div key={line.id} className="rounded-xl border border-[#e0e5ee] bg-[#f8fafc] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-[#304153]">Sample line {index + 1}</p>
                    <button type="button" onClick={() => removeSampleLine(line.id)} className="text-[12px] font-semibold text-[#a23b22]">
                      Clear
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                    <Input value={line.sku} onChange={(event) => updateSampleLine(line.id, 'sku', event.target.value)} placeholder="SKU / item code" className="h-10 text-[14px]" />
                    <Input value={line.quantity} onChange={(event) => updateSampleLine(line.id, 'quantity', event.target.value)} inputMode="numeric" placeholder="Qty" className="h-10 text-[14px]" />
                  </div>
                  <Input value={line.productName} onChange={(event) => updateSampleLine(line.id, 'productName', event.target.value)} placeholder="Product name" className="mt-2 h-10 text-[14px]" />
                  <Input value={line.reason} onChange={(event) => updateSampleLine(line.id, 'reason', event.target.value)} placeholder="Reason" className="mt-2 h-10 text-[14px]" />
                  <Input value={line.notes} onChange={(event) => updateSampleLine(line.id, 'notes', event.target.value)} placeholder="Optional notes" className="mt-2 h-10 text-[14px]" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#d6dae2] bg-white px-4 py-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Discrepancy Notes</p>
            <Textarea
              value={discrepancyText}
              onChange={(event) => {
                setDiscrepancyText(event.target.value);
                setPreview(null);
              }}
              placeholder="One correction per line: missing sample bag, wrong delivery note, quantity mismatch..."
              className="mt-3 min-h-[118px] border-[#c9d0dc] text-[14px]"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={handlePreview} disabled={!canPreview || previewing}>
                {previewing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {previewing ? 'Generating' : 'Preview Request'}
              </Button>
              {preview ? (
                <Button type="button" variant="secondary" onClick={handleCopyPreview}>
                  <Clipboard className="h-4 w-4" />
                  Copy Request
                </Button>
              ) : null}
            </div>
            {previewError ? <p className="mt-3 text-sm text-[#a23b22]">{previewError}</p> : null}
          </div>
        </div>
      </div>

      {preview ? (
        <div className="rounded-2xl border border-[#b8d8c4] bg-[#f1fbf4] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#25784e]">Outbound Preview</p>
              <p className="mt-1 text-[18px] font-semibold text-[#1d1f23]">{preview.subject}</p>
              <p className="mt-1 text-sm text-[#4f6657]">
                {preview.summary.sampleLineCount} sample lines · {preview.summary.discrepancyCount} correction notes · {preview.summary.existingOrderLineCount} cached order lines
              </p>
            </div>
            <FileText className="h-5 w-5 text-[#25784e]" />
          </div>
          <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-[#cfe6d5] bg-white p-4 text-[13px] leading-6 text-[#24324f]">
            {preview.message}
          </pre>
        </div>
      ) : null}
    </WorkspacePanel>
  );
}
