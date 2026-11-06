'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronLeft, ChevronRight, Info, Loader2, Printer, RefreshCw, Search, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { buildSalesView, ordersToCsv, parseSalesReport, salesMonthLabel, salesStatusLabel, type SalesOrder, type SalesReport } from '@/lib/dashboard/sales-report';
import { isPreferredPartnerFromStatuses } from '@/lib/territory/preferred-partner';
import { cn } from '@/lib/utils';

const currency = (amount: number, digits = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(amount);
const number = (amount: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(amount);
const shortDate = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
const STATUS_TONE: Record<string, string> = {
  PROCESSING: 'bg-amber-50 text-amber-800 ring-amber-200', READY_TO_SHIP: 'bg-blue-50 text-blue-700 ring-blue-200',
  DELIVERING: 'bg-indigo-50 text-indigo-700 ring-indigo-200', DELIVERED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
};

function Status({ value }: { value: string }) {
  return <span className={cn('inline-flex rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset', STATUS_TONE[value] ?? 'bg-slate-100 text-slate-600 ring-slate-200')}>{salesStatusLabel(value)}</span>;
}

function Overlay({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[6000] bg-slate-950/35 backdrop-blur-[2px]" />
      <Dialog.Content aria-describedby={undefined} className={cn('fixed inset-y-0 right-0 z-[6100] flex w-full flex-col bg-white shadow-2xl focus:outline-none', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-5">
          <Dialog.Title className="text-lg font-semibold text-slate-950">{title}</Dialog.Title>
          <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close details"><X size={18} /></Button></Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function OrderDetail({ order, onClose }: { order: SalesOrder; onClose: () => void }) {
  const lines = order.items.filter(item => item.isPiccCatalogProduct);
  return <Overlay title={order.number} onClose={onClose} wide>
    <div className="space-y-6 p-6">
      <div>
        <div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-semibold text-slate-950">{order.store}</h2><Status value={order.status} /></div>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500"><span>{shortDate(order.date)}</span><span>·</span><span>{order.rep}</span></div>
        {order.crmId && <Link className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#b8351b] hover:underline" href={`/territory?focus=${encodeURIComponent(order.crmId)}`}>Open store <ArrowUpRight size={14} /></Link>}
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
        <div><p className="text-xs text-slate-500">Order value</p><p className="mt-1 text-2xl font-semibold tabular-nums">{currency(order.total, 2)}</p></div>
        {order.returnValue > 0 && <div><p className="text-xs text-slate-500">Linked returns</p><p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800">{currency(order.returnValue, 2)}</p></div>}
        {order.deliveryDate && <div><p className="text-xs text-slate-500">Scheduled delivery</p><p className="mt-1 text-sm font-medium">{shortDate(order.deliveryDate)}</p></div>}
        {order.deliveredDate && <div><p className="text-xs text-slate-500">Delivered</p><p className="mt-1 text-sm font-medium">{shortDate(order.deliveredDate)}</p></div>}
      </div>
      {order.checks.includes('Buyer approval follow-up') && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Buyer approval follow-up</div>}
      <div>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Products</h3><span className="text-xs text-slate-500">{lines.length} lines</span></div>
        <div className="divide-y divide-slate-100">
          {lines.map(item => <div key={item.id} className="flex justify-between gap-4 py-3">
            <div className="min-w-0"><p className="text-sm font-medium leading-5 text-slate-800">{item.name}</p><p className="mt-1 text-xs text-slate-500">{number(item.quantity)} × {currency(item.unitPrice, 2)}{item.isSample ? ' · Sample' : ''}{item.returnedQuantity > 0 ? ` · ${number(item.returnedQuantity)} returned` : ''}</p></div>
            <span className="shrink-0 pt-0.5 text-sm font-medium tabular-nums">{currency(item.lineValue, 2)}</span>
          </div>)}
        </div>
      </div>
    </div>
  </Overlay>;
}

function AccountOverview({ snapshot, rep }: { snapshot: NonNullable<SalesReport['accountSummary']>; rep: string }) {
  const selected = rep ? snapshot.reps.find(item => item.name === rep) : snapshot;
  if (!selected) return null;
  const snapshotDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(snapshot.snapshotAt));
  const stages = Object.entries(selected.pppStatuses).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  const stageColor = (name: string) => isPreferredPartnerFromStatuses(name) ? '#57866a' : /pending|api key|intro/i.test(name) ? '#c7a55e' : /removed/i.test(name) ? '#bb7c70' : '#cbd0c8';
  const shortStage = (name: string) => ({ 'Approved & Connected': 'Approved', 'Self-Reporting Inventory PPP': 'Self-reporting', 'Self-Managed Inventory PPP': 'Self-managed', 'API Key Needed to Complete': 'API key needed', 'Intro to PPP Only': 'Introduced', 'Removed from PPP': 'Removed' }[name] ?? name);
  const cohortLink = (name: string) => { const params = new URLSearchParams({ ppp: name }); if (rep) params.set('rep', rep); return `/territory?${params.toString()}`; };
  return <section aria-label="Current account overview" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Current accounts{rep ? <span className="ml-2 font-normal text-slate-400">{rep}</span> : null}</h2><span className="text-[11px] text-slate-400">{snapshot.source} · {snapshotDate}</span></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="grid grid-cols-3 divide-x divide-slate-100">{[{ label: 'Accounts', value: selected.accounts }, { label: 'Customers', value: selected.customers }, { label: 'Active PPP', value: selected.pppApproved }].map((item, index) => <div key={item.label} className={cn(index ? 'pl-5' : '')}><p className="text-[27px] font-semibold leading-tight tabular-nums">{number(item.value)}</p><p className="mt-1 text-xs text-slate-500">{item.label}</p></div>)}</div>
      <div><div className="mb-3 flex h-2 overflow-hidden rounded-full" aria-label="PPP status distribution">{stages.map(([name, count]) => <Link key={name} href={cohortLink(name)} aria-label={`${name}: ${count} accounts`} title={`${name}: ${count}`} style={{ width: `${selected.accounts ? count / selected.accounts * 100 : 0}%`, backgroundColor: stageColor(name) }} />)}</div><div className="flex flex-wrap gap-x-4 gap-y-2">{stages.map(([name, count]) => <Link key={name} href={cohortLink(name)} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-900 hover:underline"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stageColor(name) }} />{shortStage(name)}<span className="font-medium tabular-nums text-slate-700">{count}</span></Link>)}</div></div>
    </div>
  </section>;
}

export function SalesWorkspace() {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState('');
  const [rep, setRep] = useState('');
  const [product, setProduct] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [productTab, setProductTab] = useState<'all' | 'launches'>('all');
  const [trend, setTrend] = useState<'daily' | 'cumulative'>('cumulative');
  const [detail, setDetail] = useState<SalesOrder | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [page, setPage] = useState(0);
  const chartId = useId().replace(/:/g, '');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/reports/current', { signal });
      if (!response.ok) throw new Error('Current sales could not be loaded.');
      const payload = parseSalesReport(await response.json());
      setReport(payload); setMonth(current => current || payload.defaultPeriod);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Current sales could not be loaded.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const view = useMemo(() => buildSalesView(report?.orders ?? [], { month, rep, product, status, query }), [report, month, rep, product, status, query]);
  const months = useMemo(() => [...new Set(report?.orders.map(order => order.date.slice(0, 7)) ?? [])].sort().reverse(), [report]);
  const reps = useMemo(() => [...new Set(report?.orders.map(order => order.rep) ?? [])].sort(), [report]);
  const chartProducts = view.products.filter(item => productTab === 'all' || report?.launchFamilies.includes(item.name));
  const maxProduct = Math.max(...chartProducts.map(item => item.retainedValue), 1);
  const totalPages = Math.ceil(view.orders.length / 15);
  const currentPage = Math.min(page, Math.max(totalPages - 1, 0));
  const displayOrders = view.orders.slice(currentPage * 15, currentPage * 15 + 15);
  const resetFilters = () => { setRep(''); setProduct(''); setStatus(''); setQuery(''); setPage(0); };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([ordersToCsv(view.orders)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `picc-orders-${month}${rep ? `-${rep.replace(/\s+/g, '-').toLowerCase()}` : ''}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  if (!report) return <div className="flex min-h-[55vh] items-center justify-center p-6"><div className="max-w-sm text-center">
    {loading ? <><Loader2 className="mx-auto animate-spin text-slate-400" size={24} /><p className="mt-3 text-sm text-slate-500">Loading sales…</p></> : <><h1 className="text-lg font-semibold">Sales unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p><Button onClick={() => void load()} variant="outline" className="mt-4"><RefreshCw size={15} /> Retry</Button><Link href="/dashboard" className="mt-4 block text-sm text-slate-600 underline">Nabis history</Link></>}
  </div></div>;

  return <div className="sales-workspace mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 text-slate-900 sm:px-7 lg:px-9 lg:py-7">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Sales</h1><button onClick={() => setSourceOpen(true)} className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{report.source.name}<span className="text-slate-300">·</span>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: report.timezone }).format(new Date(report.generatedAt))}<Info size={12} /></button></div>
      <div className="sales-controls flex flex-wrap items-center gap-2"><Link href="/dashboard" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium">Nabis history</Link>
        <select aria-label="Sales month" value={month} onChange={event => { setMonth(event.target.value); setPage(0); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm focus:ring-2 focus:ring-slate-400">{months.map(value => <option key={value} value={value}>{salesMonthLabel(value)}</option>)}</select>
        <select aria-label="Sales rep" value={rep} onChange={event => { setRep(event.target.value); setPage(0); }} className="h-10 max-w-[180px] rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm focus:ring-2 focus:ring-slate-400"><option value="">All reps</option>{reps.map(name => <option key={name}>{name}</option>)}</select>
        <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Reload sales" disabled={loading} className="border-slate-200"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></Button>
        <Button variant="outline" onClick={exportCsv} className="border-slate-200"><ArrowDownToLine size={15} /> CSV</Button>
        <Button variant="outline" size="icon" onClick={() => window.print()} aria-label="Print or save sales as PDF" className="border-slate-200"><Printer size={16} /></Button>
      </div>
    </header>
    {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>{error}</span><button onClick={() => void load()} className="font-semibold underline">Retry</button></div>}

    {(product || status || query) && <div className="sales-controls flex flex-wrap items-center gap-2 text-xs">
      {product && <button onClick={() => setProduct('')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">Orders containing {product}<X size={12} /></button>}
      {status && <button onClick={() => setStatus('')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">{salesStatusLabel(status)}<X size={12} /></button>}
      {query && <button onClick={() => setQuery('')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">Search: {query}<X size={12} /></button>}
      <button onClick={resetFilters} className="px-2 text-slate-500 hover:text-slate-900">Clear filters</button>
    </div>}

    <section aria-label="Sales totals" className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-4">
      {[{ label: 'Order value', value: currency(view.summary.orderValue, 2), detail: `${currency(view.summary.openValue)} open` }, { label: 'Commercial orders', value: number(view.summary.orderCount), detail: `${view.excludedDrafts} drafts excluded` }, { label: 'Buying stores', value: number(view.summary.buyingStores), detail: `${view.reps.filter(item => item.name !== 'Unassigned').length} assigned reps` }, { label: 'Average order', value: currency(view.summary.averageOrderValue), detail: `${currency(view.summary.returnValue, 2)} linked returns` }].map((metric, index) => <div key={metric.label} className={cn('px-4 py-5 sm:px-6', index > 1 && 'border-t border-slate-200 lg:border-t-0')}>
        <p className="text-xs font-medium text-slate-500">{metric.label}</p><p className={cn('mt-2 text-[25px] font-semibold leading-tight tabular-nums sm:text-[30px]', index === 0 && 'text-[#ad351e]')}>{metric.value}</p><p className="mt-2 text-xs text-slate-400">{metric.detail}</p>
      </div>)}
    </section>

    {view.orders.length > 0 ? <>
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section aria-label="Order value trend" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Order value</h2><p className="mt-1 text-xs text-slate-400">{salesMonthLabel(month)}</p></div><div className="sales-controls inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">{(['cumulative', 'daily'] as const).map(value => <button key={value} aria-pressed={trend === value} onClick={() => setTrend(value)} className={cn('rounded-md px-2.5 py-1.5', trend === value ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500')}>{value === 'cumulative' ? 'Cumulative' : 'Daily'}</button>)}</div></div>
          <div className="h-[245px] w-full" role="img" aria-label={`${trend === 'cumulative' ? 'Cumulative' : 'Daily'} order values for ${salesMonthLabel(month)}, total ${currency(view.summary.orderValue, 2)}`}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={view.daily} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
              <defs><linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c93412" stopOpacity={0.14} /><stop offset="100%" stopColor="#c93412" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid stroke="#edf0f3" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={28} dy={8} />
              <YAxis tickFormatter={value => value >= 1000 ? `$${number(value / 1000)}k` : `$${value}`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={62} />
              <Tooltip formatter={value => [currency(Number(value), 2), 'Order value']} labelFormatter={value => shortDate(String(value))} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 16px #0f172a0a' }} />
              <Area type="monotone" dataKey={trend === 'cumulative' ? 'cumulative' : 'value'} stroke="#c93412" strokeWidth={2.5} fill={`url(#${chartId})`} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }} isAnimationActive={false} />
            </AreaChart></ResponsiveContainer>
          </div>
        </section>

        <section aria-label="Product sales" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Product sales</h2><p className="mt-1 text-xs text-slate-400">Retained line value</p></div><div className="sales-controls inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">{(['all', 'launches'] as const).map(value => <button key={value} aria-pressed={productTab === value} onClick={() => setProductTab(value)} className={cn('rounded-md px-2.5 py-1.5', productTab === value ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500')}>{value === 'all' ? 'All' : 'Launches'}</button>)}</div></div>
          <div className="max-h-[245px] space-y-3 overflow-y-auto pr-1">
            {chartProducts.map((item, index) => <button key={item.name} onClick={() => { setProduct(current => current === item.name ? '' : item.name); setPage(0); }} className="group block w-full text-left" aria-pressed={product === item.name}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs"><span className="flex items-center gap-1.5 font-medium text-slate-700 group-hover:text-[#ad351e]">{item.name}{product === item.name && <Check size={12} />}</span><span className="font-medium tabular-nums">{currency(item.retainedValue)}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full', productTab === 'launches' ? 'bg-[#c93412]' : index === 0 ? 'bg-slate-800' : 'bg-slate-400')} style={{ width: `${Math.max(0, item.retainedValue / maxProduct * 100)}%` }} /></div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{number(item.units - item.returnedUnits)} units · {item.stores} stores</span>{item.returnedUnits > 0 && <span>{number(item.returnedUnits)} returned</span>}</div>
            </button>)}
            {chartProducts.length === 0 && <div className="py-8 text-center text-sm text-slate-500">{report.launchFamilies.length ? 'No launch orders in this selection.' : 'Launch classification unavailable.'}<button onClick={() => setProductTab('all')} className="mx-auto mt-2 block font-medium text-slate-800 underline">All products</button></div>}
          </div>
        </section>
      </div>

      {report.accountSummary && <AccountOverview snapshot={report.accountSummary} rep={rep} />}

      <section aria-label="Sales by assigned rep" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 sm:px-6"><h2 className="text-sm font-semibold">Assigned territory</h2>{rep && <button onClick={() => setRep('')} className="sales-controls text-xs text-slate-500 hover:text-slate-900">All reps</button>}</div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-y border-slate-100 bg-slate-50/70 text-xs text-slate-400"><th className="px-5 py-2.5 font-medium sm:px-6">Rep</th><th className="px-4 py-2.5 text-right font-medium">Orders</th><th className="px-4 py-2.5 text-right font-medium">Stores</th><th className="px-4 py-2.5 text-right font-medium">Order value</th><th className="hidden w-[24%] px-6 py-2.5 font-medium sm:table-cell">Share</th></tr></thead><tbody className="divide-y divide-slate-100">
          {view.reps.map((item, index) => <tr key={item.name} className="hover:bg-slate-50"><td className="px-5 py-3 sm:px-6"><button onClick={() => { setRep(current => current === item.name ? '' : item.name); setPage(0); }} className="flex items-center gap-2.5 text-left font-medium"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">{item.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span>{item.name}</button></td><td className="px-4 py-3 text-right tabular-nums text-slate-500">{item.orders}</td><td className="px-4 py-3 text-right tabular-nums text-slate-500">{item.stores}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{currency(item.value, 2)}</td><td className="hidden px-6 py-3 sm:table-cell"><div className="flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full', index === 0 ? 'bg-[#c93412]' : 'bg-slate-300')} style={{ width: `${view.summary.orderValue ? item.value / view.summary.orderValue * 100 : 0}%` }} /></div><span className="w-8 text-right text-xs tabular-nums text-slate-400">{view.summary.orderValue ? Math.round(item.value / view.summary.orderValue * 100) : 0}%</span></div></td></tr>)}
        </tbody></table></div>
      </section>
    </> : <div className="rounded-xl border border-slate-200 bg-white py-14 text-center"><p className="font-medium">No orders match these filters.</p><Button variant="outline" onClick={resetFilters} className="mt-4">Clear filters</Button></div>}

    <section aria-label="Commercial orders" className="sales-order-table overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Orders</h2><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{view.orders.length}</span></div><div className="sales-controls flex flex-wrap gap-2"><div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input aria-label="Search sales orders" placeholder="Search orders or stores" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} className="h-9 w-[205px] rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs focus:ring-2 focus:ring-slate-400" /></div><select aria-label="Order status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">All statuses</option>{view.statuses.map(value => <option key={value} value={value}>{salesStatusLabel(value)}</option>)}</select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-y border-slate-100 bg-slate-50/70 text-xs text-slate-400"><th className="px-5 py-2.5 font-medium sm:px-6">Store / order</th><th className="px-4 py-2.5 font-medium">Date</th><th className="hidden px-4 py-2.5 font-medium md:table-cell">Assigned rep</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-5 py-2.5 text-right font-medium sm:px-6">Order value</th></tr></thead><tbody className="divide-y divide-slate-100">
        {displayOrders.map(order => <tr key={order.id} className="group hover:bg-slate-50"><td className="max-w-[350px] px-5 py-3 sm:px-6"><button onClick={() => setDetail(order)} className="text-left"><span className="block font-medium text-slate-800 group-hover:text-[#ad351e]">{order.store}</span><span className="mt-0.5 block text-[11px] text-slate-400">{order.number}{order.checks.includes('Buyer approval follow-up') ? ' · Approval follow-up' : ''}</span></button></td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{shortDate(order.date)}</td><td className="hidden px-4 py-3 text-xs text-slate-500 md:table-cell">{order.rep}</td><td className="px-4 py-3"><Status value={order.status} /></td><td className="px-5 py-3 text-right sm:px-6"><button onClick={() => setDetail(order)} className="inline-flex items-center gap-2 font-medium tabular-nums">{currency(order.total, 2)}<ChevronRight size={13} className="text-slate-300" /></button></td></tr>)}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-400 sm:px-6"><span>{view.orders.length ? `${currentPage * 15 + 1}–${Math.min((currentPage + 1) * 15, view.orders.length)} of ${view.orders.length}` : '0 orders'}</span><div className="sales-controls flex items-center gap-2"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous orders" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></Button><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next orders" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></Button></div></div>
    </section>

    <table className="sales-print-orders hidden w-full text-left text-xs"><caption className="pb-3 text-left text-sm font-semibold">Commercial orders · {salesMonthLabel(month)}{rep ? ` · ${rep}` : ''}</caption><thead><tr>{['Order', 'Store', 'Date', 'Assigned rep', 'Status', 'Value', 'Returns'].map(label => <th key={label} className="border-b border-slate-300 p-2">{label}</th>)}</tr></thead><tbody>{view.orders.map(order => <tr key={order.id}><td className="border-b border-slate-100 p-2">{order.number}</td><td className="border-b border-slate-100 p-2">{order.store}</td><td className="border-b border-slate-100 p-2">{order.date}</td><td className="border-b border-slate-100 p-2">{order.rep}</td><td className="border-b border-slate-100 p-2">{salesStatusLabel(order.status)}</td><td className="border-b border-slate-100 p-2 text-right tabular-nums">{currency(order.total, 2)}</td><td className="border-b border-slate-100 p-2 text-right tabular-nums">{currency(order.returnValue, 2)}</td></tr>)}</tbody></table>

    {detail && <OrderDetail order={detail} onClose={() => setDetail(null)} />}
    {sourceOpen && <Overlay title="Sales source" onClose={() => setSourceOpen(false)}><div className="space-y-6 p-6">
      <dl className="space-y-4 text-sm">{[['Source', report.source.name], ['Workspace', report.source.workspace], ['Scope', report.source.scope], ['Timezone', report.timezone], ['Order coverage', `${shortDate(report.source.firstAvailableOrder)} – ${shortDate(report.source.lastAvailableOrder)}`], ['Records', number(report.source.retrievedOrders)]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
      <div className="border-t border-slate-200 pt-5"><h3 className="text-sm font-semibold">Metric definitions</h3><dl className="mt-3 space-y-4 text-xs leading-5 text-slate-500"><div><dt className="font-medium text-slate-800">Order value</dt><dd>{report.definitions.orderValue}</dd></div><div><dt className="font-medium text-slate-800">Products</dt><dd>{report.definitions.productLineValue}</dd></div><div><dt className="font-medium text-slate-800">Assigned rep</dt><dd>{report.definitions.rep}</dd></div></dl></div>
      {Object.entries(report.coverage).some(([, value]) => value.includes('403')) && <div className="border-t border-slate-200 pt-5"><h3 className="text-sm font-semibold">Additional brands</h3><dl className="mt-3 space-y-3 text-xs">{Object.entries(report.coverage).filter(([, value]) => value.includes('403')).map(([name]) => <div key={name} className="flex justify-between gap-4"><dt className="text-slate-700">{name}</dt><dd className="text-amber-700">API access unavailable</dd></div>)}</dl></div>}
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#ad351e]">Nabis history <ArrowUpRight size={14} /></Link>
    </div></Overlay>}
    <style jsx global>{`@media print { .sales-controls, .sales-order-table { display: none !important; } .sales-print-orders { display: table !important; } .sales-workspace { max-width: none !important; padding: 0 !important; } .sales-workspace section { break-inside: avoid; box-shadow: none !important; } .sales-print-orders tr { break-inside: avoid; } }`}</style>
  </div>;
}
