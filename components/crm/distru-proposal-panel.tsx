'use client';

import { ChevronDown, Download, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { Button } from '@/components/ui';
import {
  decimalInputToInteger, parseProposalResponse, proposalFingerprint, proposalLineAmounts, summarizeProposal, validateProposal,
  type DistruProposal, type ProposalLine, type ProposalProduct,
} from '@/lib/proposals/distru-proposal';
import { cn } from '@/lib/utils';

const currency = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const drafts = new Map<string, DistruProposal>();
const fieldClass = 'h-9 w-full rounded-md border border-[#dedfd8] bg-[#fdfdfb] px-2 text-xs tabular-nums text-[#252724] focus:outline-none focus:ring-1 focus:ring-[#a7321b]';

export function DistruProposalPanel({ accountId, focusProductId }: { accountId: string; focusProductId?: string | null }) {
  const { canEdit } = useAppAccess();
  const activeAccountId = useRef(accountId);
  activeAccountId.current = accountId;
  const [proposal, setProposal] = useState<DistruProposal | null>(null);
  const [catalog, setCatalog] = useState<ProposalProduct[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSaving(false);
    setDownloading(false);
    setError(null);
    setProposal(null);
    setCatalog([]);
    setPickerOpen(false);
    setQuery('');
    setOpenBrand(null);
    void fetch(`/api/proposals/${encodeURIComponent(accountId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Proposal could not be loaded.');
        const result = parseProposalResponse(payload);
        if (controller.signal.aborted) return;
        const draft = canEdit ? drafts.get(accountId) : undefined;
        setSavedFingerprint(proposalFingerprint(result.proposal));
        setProposal(draft?.revision === result.proposal.revision ? draft : result.proposal);
        setCatalog(result.catalog);
        if (focusProductId) {
          const focusedLine = (draft?.revision === result.proposal.revision ? draft : result.proposal).lines.find(line => line.productId === focusProductId);
          if (focusedLine) {
            setOpenBrand(focusedLine.brand);
          } else {
            const product = result.catalog.find(row => row.productId === focusProductId);
            if (product && canEdit) {
              setPickerOpen(true);
              setQuery(product.sku || product.name);
            }
          }
        }
      })
      .catch(caught => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Proposal could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accountId, reloadKey, focusProductId, canEdit]);

  const dirty = proposal ? proposalFingerprint(proposal) !== savedFingerprint : false;
  const groups = useMemo(() => {
    const byBrand = new Map<string, ProposalLine[]>();
    for (const line of proposal?.lines ?? []) byBrand.set(line.brand, [...(byBrand.get(line.brand) ?? []), line]);
    return [...byBrand.entries()];
  }, [proposal?.lines]);
  const totals = useMemo(() => {
    try { return summarizeProposal(proposal?.lines ?? []); } catch { return null; }
  }, [proposal?.lines]);
  const products = catalog.filter(product => {
    if (proposal?.lines.some(line => line.productId === product.productId)) return false;
    const search = `${product.name} ${product.brand} ${product.sku ?? ''}`.toLowerCase();
    return !query || search.includes(query.toLowerCase());
  });

  function updateProposal(next: DistruProposal) {
    if (!canEdit) return;
    drafts.set(accountId, next);
    setProposal(next);
    setError(null);
  }
  function updateLine(productId: string, patch: Partial<ProposalLine>) {
    if (!proposal) return;
    updateProposal({ ...proposal, lines: proposal.lines.map(line => line.productId === productId ? { ...line, ...patch } : line) });
  }
  function addProduct(product: ProposalProduct) {
    if (!canEdit || !proposal || proposal.lines.some(line => line.productId === product.productId)) return;
    updateProposal({ ...proposal, lines: [...proposal.lines, { ...product, cases: 1, discountBps: 0, paymentTerms: product.codOnly ? 'COD' : product.paymentTerms, confirmed: false }] });
    setOpenBrand(product.brand);
    setPickerOpen(false);
    setQuery('');
  }

  async function saveProposal(): Promise<DistruProposal | null> {
    if (!canEdit || !proposal) return null;
    const errors = validateProposal(proposal.lines);
    if (errors.length) {
      setError(errors[0]);
      return null;
    }
    const expected = proposalFingerprint(proposal);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${encodeURIComponent(accountId)}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: proposal.revision, lines: proposal.lines, notes: proposal.notes, terms: proposal.terms }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Proposal could not be saved.');
      const written = parseProposalResponse(payload);
      const readback = await fetch(`/api/proposals/${encodeURIComponent(accountId)}`, { cache: 'no-store' });
      if (!readback.ok) throw new Error('Saved proposal could not be verified. Reload before exporting.');
      const verified = parseProposalResponse(await readback.json());
      if (verified.proposal.revision !== written.proposal.revision || proposalFingerprint(verified.proposal) !== expected) {
        throw new Error('Saved proposal changed. Reload before exporting.');
      }
      if (activeAccountId.current !== accountId) return null;
      setProposal(verified.proposal);
      setCatalog(verified.catalog);
      setSavedFingerprint(expected);
      drafts.delete(accountId);
      toast.success('Proposal saved');
      return verified.proposal;
    } catch (caught) {
      if (activeAccountId.current === accountId) setError(caught instanceof Error ? caught.message : 'Proposal could not be saved.');
      return null;
    } finally {
      if (activeAccountId.current === accountId) setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!proposal) return;
    if (dirty && !canEdit) {
      setError('Only saved proposals can be exported with read-only access.');
      return;
    }
    const errors = validateProposal(proposal.lines);
    if (errors.length) { setError(errors[0]); return; }
    const saved = dirty ? await saveProposal() : proposal;
    if (!saved) return;
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${encodeURIComponent(accountId)}/pdf?revision=${saved.revision}`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'PDF could not be generated.');
      }
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('PDF export returned an unexpected format.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${saved.storeName.replace(/[^a-z0-9 _-]/gi, '').trim() || 'PICC'}-proposal-r${saved.revision}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF could not be generated.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <div className="space-y-3" aria-label="Loading proposal"><div className="h-5 w-28 animate-pulse rounded bg-[#eeefea]" /><div className="h-20 animate-pulse rounded bg-[#eeefea]" /><div className="h-10 animate-pulse rounded bg-[#eeefea]" /></div>;
  if (!proposal) return <div className="space-y-3"><p role="alert" className="text-sm text-[#a7321b]">{error || 'Proposal unavailable'}</p><Button variant="secondary" size="sm" onClick={() => setReloadKey(key => key + 1)}>Retry</Button></div>;

  return (
    <div className="space-y-4" aria-label="Mock order proposal editor">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#252724]">Mock order</h3>
          <p className="mt-1 text-[11px] text-[#74766f]">{proposal.orderNumber || 'New proposal'} · {dirty ? 'Unsaved changes' : `Revision ${proposal.revision}`}</p>
        </div>
        <span className="rounded border border-[#e3dfce] bg-[#f7f4e8] px-2 py-1 text-[10px] font-medium text-[#827039]">Proposal</span>
      </div>

      {proposal.lines.length && totals ? (
        <div className="border-y border-[#e5e6e1] py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold tabular-nums text-[#252724]">{currency(totals.netCents)}</span>
            <span className="text-xs tabular-nums text-[#74766f]">{totals.cases} cases · {totals.units} units</span>
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[#74766f]"><span>Regular {currency(totals.regularCents)}</span><span>Savings {currency(totals.savingsCents)}</span></div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {canEdit ? <Button type="button" variant="secondary" size="sm" className="flex-1 text-xs" onClick={() => setPickerOpen(open => !open)} disabled={!canEdit || saving || downloading}><Plus className="h-3.5 w-3.5" />Add product</Button> : <span className="flex-1 text-xs text-[#74766f]">Read-only</span>}
        {canEdit ? <Button type="button" size="sm" className="text-xs" onClick={() => void saveProposal()} disabled={!dirty || saving || downloading || !proposal.lines.length}>{saving ? 'Saving…' : 'Save'}</Button> : null}
        <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={() => void downloadPdf()} disabled={!proposal.lines.length || saving || downloading}><Download className="h-3.5 w-3.5" />{downloading ? 'Exporting…' : 'PDF'}</Button>
      </div>

      {error ? <div role="alert" className="rounded-md border border-[#e7c7bd] bg-[#fbf2ed] px-3 py-2 text-xs leading-relaxed text-[#a7321b]">{error}</div> : null}

      {pickerOpen && canEdit ? (
        <div className="rounded-lg border border-[#dedfd8]">
          <div className="flex items-center gap-2 border-b border-[#e5e6e1] px-3">
            <Search className="h-3.5 w-3.5 text-[#8a8d84]" />
            <input autoFocus aria-label="Search proposal catalog" value={query} onChange={event => setQuery(event.target.value)} placeholder="Product, brand or SKU" className="h-10 min-w-0 flex-1 bg-transparent text-xs outline-none" />
            <button type="button" onClick={() => setPickerOpen(false)} aria-label="Close catalog" className="grid h-8 w-8 place-items-center text-[#74766f]"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-[#eeefea]">
            {products.map(product => {
              const availableCases = typeof product.availableUnits === 'number' ? Math.floor(product.availableUnits / product.unitsPerCase) : null;
              return <button type="button" key={product.productId} onClick={() => addProduct(product)} disabled={availableCases === 0 || saving || downloading} className="w-full px-3 py-3 text-left hover:bg-[#f3f4ef] disabled:opacity-45">
                <span className="block text-xs font-medium leading-relaxed">{product.name}</span>
                <span className="mt-1 flex justify-between gap-2 text-[11px] text-[#74766f]"><span>{product.unitsPerCase}/case{availableCases !== null ? ` · ${availableCases} available` : ''}</span><span className="tabular-nums">{currency(product.unitPriceCents * product.unitsPerCase)}</span></span>
                {product.requiresConfirmation ? <span className="mt-1 block text-[10px] text-[#947132]">Confirmation required</span> : null}
              </button>;
            })}
            {!products.length ? <p className="px-3 py-4 text-xs text-[#74766f]">No matching products</p> : null}
          </div>
        </div>
      ) : null}

      <div className="divide-y divide-[#e5e6e1]">
        {groups.map(([brand, lines]) => {
          let brandTotal: number | null = null;
          try { brandTotal = summarizeProposal(lines).netCents; } catch { /* Invalid field remains editable. */ }
          return (
            <section key={brand}>
              <button type="button" aria-expanded={openBrand === brand} onClick={() => setOpenBrand(openBrand === brand ? null : brand)} className="flex min-h-12 w-full items-center gap-2 text-left">
                <ChevronDown className={cn('h-3.5 w-3.5 text-[#8a8d84] transition-transform', openBrand === brand && 'rotate-180')} />
                <span className="min-w-0 flex-1 text-xs font-semibold">{brand}<span className="ml-1.5 font-normal tabular-nums text-[#8a8d84]">{lines.length}</span></span>
                {brandTotal !== null ? <span className="text-xs font-medium tabular-nums">{currency(brandTotal)}</span> : null}
              </button>
              {openBrand === brand ? <div className="space-y-4 pb-4">{lines.map(line => {
                const label = line.sku || line.name;
                let amount: number | null = null;
                try { amount = proposalLineAmounts(line).netCents; } catch { /* Validation is shown on save. */ }
                const exceedsInventory = typeof line.availableUnits === 'number' && line.cases * line.unitsPerCase > line.availableUnits;
                return <div key={line.productId} className="border-t border-[#eeefea] pt-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-xs font-medium leading-relaxed">{line.name}</p><p className="mt-1 text-[10px] text-[#8a8d84]">{[line.sku, line.thcLabel, line.typeLabel].filter(Boolean).join(' · ')}</p></div>
                    <button type="button" aria-label={`Remove ${label}`} onClick={() => updateProposal({ ...proposal, lines: proposal.lines.filter(item => item.productId !== line.productId) })} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#8a8d84] hover:bg-[#f7eeea] hover:text-[#a7321b]" disabled={!canEdit || saving || downloading}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="mt-3 grid grid-cols-[64px_72px_1fr] gap-2">
                    <label className="text-[10px] text-[#74766f]">Cases<input aria-label={`Cases for ${label}`} type="number" min="1" step="1" value={Number.isFinite(line.cases) ? line.cases : ''} onChange={event => updateLine(line.productId, { cases: event.target.value === '' ? 0 : Number(event.target.value) })} className={cn(fieldClass, 'mt-1')} disabled={!canEdit || saving || downloading} /></label>
                    <label className="text-[10px] text-[#74766f]">Discount %<input aria-label={`Discount for ${label}`} type="number" min="0" max="100" step="0.01" value={Number.isFinite(line.discountBps) ? line.discountBps / 100 : ''} onChange={event => updateLine(line.productId, { discountBps: decimalInputToInteger(event.target.value) })} className={cn(fieldClass, 'mt-1')} disabled={!canEdit || saving || downloading} /></label>
                    <label className="text-[10px] text-[#74766f]">Terms<select aria-label={`Terms for ${label}`} value={line.paymentTerms} onChange={event => updateLine(line.productId, { paymentTerms: event.target.value })} className={cn(fieldClass, 'mt-1 px-1')} disabled={!canEdit || line.codOnly || saving || downloading}><option value="">Choose</option>{['COD', 'Net 15', 'Net 30', 'Prepaid', ...(line.paymentTerms && !['COD', 'Net 15', 'Net 30', 'Prepaid'].includes(line.paymentTerms) ? [line.paymentTerms] : [])].map(term => <option key={term} value={term}>{term}</option>)}</select></label>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#74766f]"><span>{line.unitsPerCase} units/case{line.codOnly ? ' · COD only' : ''}</span>{amount !== null ? <span className="font-semibold tabular-nums text-[#252724]">{currency(amount)}</span> : null}</div>
                  {exceedsInventory ? <p className="mt-1 text-[10px] text-[#a7321b]">Exceeds available stock: {line.availableUnits} units</p> : null}
                  {line.requiresConfirmation ? <label className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-[#947132]"><input type="checkbox" disabled={!canEdit || saving || downloading} checked={Boolean(line.confirmed)} onChange={event => updateLine(line.productId, { confirmed: event.target.checked })} className="mt-0.5 accent-[#a7321b]" />{line.confirmationReason || 'Confirm product inclusion and terms'}</label> : null}
                  <details className="mt-2"><summary className="cursor-pointer text-[10px] text-[#8a8d84]">Unit price</summary><label className="mt-2 block max-w-28 text-[10px] text-[#74766f]">Price per unit<input aria-label={`Unit price for ${label}`} type="number" min="0" step="0.01" value={Number.isFinite(line.unitPriceCents) ? line.unitPriceCents / 100 : ''} onChange={event => updateLine(line.productId, { unitPriceCents: decimalInputToInteger(event.target.value) })} className={cn(fieldClass, 'mt-1')} disabled={!canEdit || saving || downloading} /></label></details>
                </div>;
              })}</div> : null}
            </section>
          );
        })}
      </div>

      {proposal.lines.length ? <details className="border-t border-[#e5e6e1] pt-3"><summary className="cursor-pointer text-xs text-[#74766f]">Proposal notes</summary><textarea aria-label="Proposal notes" value={proposal.notes} onChange={event => updateProposal({ ...proposal, notes: event.target.value })} rows={3} className="mt-2 w-full rounded-md border border-[#dedfd8] bg-[#fdfdfb] p-2 text-xs" disabled={!canEdit || saving || downloading} /></details> : null}
    </div>
  );
}
