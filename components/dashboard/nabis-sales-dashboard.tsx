'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  DollarSign,
  Download,
  Loader2,
  Printer,
  RefreshCcw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wifi,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import type { DashboardDateRange, NabisDashboardMetadata, NabisDashboardResponse, ProcessedNabisOrder, RepStat } from '@/lib/dashboard/nabis-types';
import { deserializeOrders, formatCurrency, formatTimestamp, getDefaultDateRange, isDateRangeValid } from '@/lib/dashboard/nabis-client';
import { SalesTrendChart } from '@/components/dashboard/sales-trend-chart';

const REP_COLORS = ['#1d4ed8', '#2563eb', '#0f766e', '#0284c7', '#7c3aed', '#db2777', '#f97316', '#eab308', '#16a34a', '#475569'];

export function NabisSalesDashboard() {
  const [dateRange, setDateRange] = useState<DashboardDateRange>(() => getDefaultDateRange());
  const [orders, setOrders] = useState<ProcessedNabisOrder[]>([]);
  const [metadata, setMetadata] = useState<NabisDashboardMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [showCanceled, setShowCanceled] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const loadDashboard = async (nextRange: DashboardDateRange, options?: { initial?: boolean; forceRefresh?: boolean }) => {
    const initial = options?.initial ?? false;

    if (initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const params = new URLSearchParams({
        start: nextRange.start,
        end: nextRange.end,
      });
      if (options?.forceRefresh) {
        params.set('refresh', '1');
      }

      const response = await fetch(`/api/dashboard?${params.toString()}`, { cache: 'no-store' });
      const payload = (await response.json()) as NabisDashboardResponse | { error?: string };

      if (!response.ok || !('orders' in payload)) {
        const message = 'error' in payload ? payload.error : undefined;
        throw new Error(message || 'Failed to load dashboard data.');
      }

      setOrders(deserializeOrders(payload.orders));
      setMetadata(payload.metadata);
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load dashboard data.';
      setError(message);
    } finally {
      if (initial) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadDashboard(getDefaultDateRange(), { initial: true });
  }, []);

  const { availableMonths, monthlyTrend } = useMemo(() => {
    const months = new Set<string>();
    const trendMap = new Map<string, number>();

    for (const order of orders) {
      months.add(order.monthKey);
      if (!order.isCanceled) {
        trendMap.set(order.monthKey, (trendMap.get(order.monthKey) || 0) + order.total);
      }
    }

    const sortedMonths = [...months].sort();
    return {
      availableMonths: sortedMonths,
      monthlyTrend: [...trendMap.entries()]
        .map(([monthKey, revenue]) => ({
          monthKey,
          name: new Date(`${monthKey}-15T12:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          }),
          revenue,
        }))
        .sort((left, right) => left.monthKey.localeCompare(right.monthKey)),
    };
  }, [orders]);

  useEffect(() => {
    const latestMonth = availableMonths[availableMonths.length - 1] || '';
    if (!latestMonth) {
      setSelectedMonth('');
      return;
    }

    if (!selectedMonth || !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(latestMonth);
    }
  }, [availableMonths, selectedMonth]);

  const monthlyData = useMemo(() => orders.filter((order) => order.monthKey === selectedMonth), [orders, selectedMonth]);

  const tableData = useMemo(() => {
    const base = showCanceled ? monthlyData : monthlyData.filter((order) => !order.isCanceled);
    return [...base].sort((left, right) => {
      if (left.createdDate.getTime() === right.createdDate.getTime()) {
        return right.orderNumber.localeCompare(left.orderNumber);
      }
      return right.createdDate.getTime() - left.createdDate.getTime();
    });
  }, [monthlyData, showCanceled]);

  const stats = useMemo(() => {
    const validOrders = monthlyData.filter((order) => !order.isCanceled);
    const totalRevenue = validOrders.reduce((sum, order) => sum + order.total, 0);
    const totalOrders = validOrders.length;

    const repMap = new Map<string, RepStat>();
    for (const order of validOrders) {
      const current = repMap.get(order.salesRep) || { name: order.salesRep, revenue: 0, orderCount: 0 };
      current.revenue += order.total;
      current.orderCount += 1;
      repMap.set(order.salesRep, current);
    }

    return {
      totalRevenue,
      totalOrders,
      repStats: [...repMap.values()].sort((left, right) => right.revenue - left.revenue),
    };
  }, [monthlyData]);

  const selectedMonthLabel = selectedMonth
    ? new Date(`${selectedMonth}-15T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : 'Selected Month';
  const rangeIsValid = isDateRangeValid(dateRange);
  const actionLocked = isRefreshing || isGeneratingPDF;

  const handleExportCSV = () => {
    if (tableData.length === 0) {
      return;
    }

    const headers = ['Order ID', 'Order Number', 'Date', 'Customer', 'Licensed Location ID', 'Matched Account', 'Sales Rep', 'Status', 'Total'];
    const rows = tableData.map((order) => [
      order.id,
      order.orderNumber,
      order.createdDate.toLocaleDateString(),
      `"${order.customerName.replace(/"/g, '""')}"`,
      order.licensedLocationId ?? '',
      `"${(order.matchedAccountName ?? '').replace(/"/g, '""')}"`,
      `"${order.salesRep.replace(/"/g, '""')}"`,
      order.status,
      order.total.toFixed(2),
    ]);

    const blob = new Blob([[headers.join(','), ...rows.map((row) => row.join(','))].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nabis_orders_${selectedMonth || 'live'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = async () => {
    if (!selectedMonth || isGeneratingPDF) {
      return;
    }

    setIsGeneratingPDF(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      let currentY = margin;

      const addSection = async (elementId: string) => {
        const element = document.getElementById(elementId);
        if (!element) return;

        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (currentY + imgHeight > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
        }

        doc.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 8;
      };

      doc.setFontSize(18);
      doc.setTextColor(30, 41, 59);
      doc.text('PICC Nabis Sales Dashboard', margin, currentY + 6);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      const monthText = `Month: ${selectedMonthLabel}`;
      doc.text(monthText, pageWidth - margin - doc.getTextWidth(monthText), currentY + 6);
      currentY += 15;

      for (const sectionId of ['kpi-section', 'trend-chart-section', 'sales-trend-section', 'rep-revenue-chart', 'market-share-card']) {
        await addSection(sectionId);
      }

      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentY = margin;
      } else {
        doc.setFontSize(12);
        doc.setTextColor(30, 41, 59);
        doc.text(`Order Details (${selectedMonthLabel})`, margin, currentY);
        currentY += 5;
      }

      autoTable(doc, {
        startY: currentY,
        head: [['Date', 'Order #', 'Customer', 'Rep', 'Status', 'Total']],
        body: tableData.map((order) => [
          order.createdDate.toLocaleDateString(),
          order.orderNumber,
          order.customerName,
          order.salesRep,
          order.status,
          formatCurrency(order.total),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [29, 78, 216] },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        margin: { left: margin, right: margin, bottom: margin },
      });

      doc.save(`Nabis_Sales_Report_${selectedMonth}.pdf`);
    } catch (caughtError) {
      console.error('PDF generation failed', caughtError);
      toast.error('Failed to generate the PDF report.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleTrendClick = (data: { activePayload?: Array<{ payload?: { monthKey?: string } }> }) => {
    const clickedMonthKey = data?.activePayload?.[0]?.payload?.monthKey;
    if (clickedMonthKey) {
      setSelectedMonth(clickedMonthKey);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="inline-flex items-center gap-3 rounded-full border border-[#d9dce2] bg-white px-5 py-3 text-sm font-medium text-[#39414d] shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#1d5eea]" />
          Syncing live orders from the Nabis NY API...
        </div>
      </div>
    );
  }

  if (!metadata && error) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border border-red-100 bg-white p-8 shadow-sm">
        <div className="mb-4 inline-flex rounded-full bg-red-50 p-3">
          <AlertCircle className="h-6 w-6 text-red-600" />
        </div>
        <h1 className="text-2xl font-semibold text-[#18212d]">Unable to reach the live dashboard</h1>
        <p className="mt-3 text-sm leading-6 text-[#5f6773]">{error}</p>
        <button
          type="button"
          onClick={() => void loadDashboard(dateRange, { initial: true, forceRefresh: true })}
          className="mt-6 inline-flex items-center rounded-xl bg-[#1d5eea] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Retry Sync
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 pb-8 ${isGeneratingPDF ? 'pointer-events-none' : ''}`}>
      <section className="overflow-hidden rounded-[28px] border border-[#d9dce2] bg-white shadow-sm">
        <div className="border-b border-[#e3e7ee] bg-[linear-gradient(135deg,#edf4ff_0%,#ffffff_55%,#f5f8ff_100%)] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#1d5eea] p-3 shadow-sm">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-[#18212d]">Live Nabis Sales Dashboard</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#5f6773]">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                      <Wifi className="mr-1.5 h-3.5 w-3.5" />
                      Live NY Orders
                    </span>
                    {metadata ? <span>Last synced {formatTimestamp(metadata.fetchedAt)}</span> : null}
                    {metadata?.cacheHit ? <span className="text-[#8a919c]">served from 5-minute cache</span> : null}
                  </div>
                </div>
              </div>
            </div>

            <div className={`flex flex-col gap-3 xl:items-end ${isGeneratingPDF ? 'opacity-0' : ''}`}>
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[180px_160px_160px_auto_auto]">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Calendar className="h-4 w-4 text-[#8a919c]" />
                  </div>
                  <select
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="block h-11 w-full rounded-xl border border-[#d3d9e2] bg-white py-2 pl-10 pr-3 text-sm text-[#243040] shadow-sm outline-none focus:border-[#1d5eea]"
                  >
                    {availableMonths.map((month) => (
                      <option key={month} value={month}>
                        {new Date(`${month}-15T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-[#d3d9e2] bg-white px-3 py-2 shadow-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#8a919c]">Start</span>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#243040] outline-none"
                  />
                </label>

                <label className="flex items-center gap-2 rounded-xl border border-[#d3d9e2] bg-white px-3 py-2 shadow-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#8a919c]">End</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#243040] outline-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void loadDashboard(dateRange, { forceRefresh: true })}
                  disabled={!rangeIsValid || actionLocked}
                  className="inline-flex items-center justify-center rounded-xl bg-[#18212d] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-[#c7ccd4]"
                >
                  {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load Range
                </button>

                <button
                  type="button"
                  onClick={() => void loadDashboard(dateRange, { forceRefresh: true })}
                  disabled={actionLocked}
                  className="inline-flex items-center justify-center rounded-xl border border-[#d3d9e2] bg-white px-4 py-2.5 text-sm font-semibold text-[#243040] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={tableData.length === 0 || actionLocked}
                  className="inline-flex items-center rounded-xl border border-[#d3d9e2] bg-white px-3 py-2 text-sm font-medium text-[#243040] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={!selectedMonth || actionLocked}
                  className="inline-flex items-center rounded-xl border border-[#d3d9e2] bg-white px-3 py-2 text-sm font-medium text-[#243040] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingPDF ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
                </button>
              </div>
            </div>
          </div>

          {metadata ? (
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <InfoCard label="Requested Range" value={`${metadata.range.startCreatedAt} to ${metadata.range.endCreatedAt}`} />
              <InfoCard
                label="Valid Orders Loaded"
                value={metadata.uniqueOrders.toLocaleString()}
                note={[
                  metadata.canceledOrders > 0 ? `${metadata.canceledOrders.toLocaleString()} canceled order${metadata.canceledOrders === 1 ? '' : 's'} excluded` : null,
                  metadata.internalTransferOrders > 0
                    ? `${metadata.internalTransferOrders.toLocaleString()} internal transfer${metadata.internalTransferOrders === 1 ? '' : 's'} excluded`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
              <InfoCard
                label="Line Items Scanned"
                value={`${metadata.lineItems.toLocaleString()} from ${metadata.pagesScanned.toLocaleString()} scanned page${metadata.pagesScanned === 1 ? '' : 's'}`}
              />
            </div>
          ) : null}

          {error ? (
            <Banner tone="warning">
              {metadata ? 'Showing the last successful sync. ' : ''}
              {error}
            </Banner>
          ) : null}

          {metadata?.partialScan ? (
            <Banner tone="info">
              The NY feed is scanned incrementally from newest to oldest. If a broader date range looks incomplete, narrow the window and reload.
            </Banner>
          ) : null}
        </div>

        <div className="space-y-6 px-4 py-5 sm:px-6">
          {availableMonths.length === 0 ? (
            <div className="rounded-[24px] border border-[#e2e8f0] bg-white p-10 text-center">
              <h2 className="text-xl font-semibold text-[#18212d]">No orders matched this range</h2>
              <p className="mt-3 text-sm text-[#5f6773]">Adjust the start and end dates, then load the range again.</p>
            </div>
          ) : (
            <>
              <div id="kpi-section" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <KpiCard icon={<DollarSign className="h-7 w-7 text-emerald-600" />} iconBg="bg-emerald-50" label={`Total Revenue (${selectedMonth})`} value={formatCurrency(stats.totalRevenue)} helper="Net sales" />
                <KpiCard icon={<ShoppingBag className="h-7 w-7 text-blue-600" />} iconBg="bg-blue-50" label={`Total Orders (${selectedMonth})`} value={String(stats.totalOrders)} helper="Valid orders" />
                <KpiCard icon={<Users className="h-7 w-7 text-indigo-600" />} iconBg="bg-indigo-50" label="Active Sales Reps" value={String(stats.repStats.length)} helper="Contributors" />
              </div>

              <div id="trend-chart-section" className="rounded-[24px] border border-[#dfe3ea] bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[#1d5eea]" />
                    <h2 className="text-lg font-semibold text-[#18212d]">Monthly Revenue Trend</h2>
                  </div>
                  <span className={`text-sm text-[#8a919c] ${isGeneratingPDF ? 'opacity-0' : ''}`}>Click a bar to filter dashboard</span>
                </div>
                <div className="h-[300px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }} onClick={handleTrendClick}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                      <YAxis tickFormatter={(value) => `$${value / 1000}k`} stroke="#64748b" fontSize={12} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)' }}
                        formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                      />
                      <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={60} isAnimationActive={!isGeneratingPDF}>
                        {monthlyTrend.map((entry, index) => (
                          <Cell key={`${entry.monthKey}-${index}`} fill={entry.monthKey === selectedMonth ? '#1d5eea' : '#cbd5e1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <SalesTrendChart orders={monthlyData} selectedMonth={selectedMonth} />

              <div className="grid gap-6 lg:grid-cols-3">
                <div id="rep-revenue-chart" className="rounded-[24px] border border-[#dfe3ea] bg-white p-5 shadow-sm lg:col-span-2">
                  <h2 className="mb-5 text-lg font-semibold text-[#18212d]">Revenue by Sales Rep ({selectedMonth})</h2>
                  <div className="h-[420px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.repStats} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#e2e8f0" />
                        <XAxis type="number" tickFormatter={(value) => `$${value / 1000}k`} stroke="#64748b" fontSize={12} />
                        <YAxis type="category" dataKey="name" width={160} stroke="#64748b" fontSize={12} tick={{ fontSize: 12 }} />
                        <Tooltip
                          cursor={{ fill: '#f1f5f9' }}
                          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)' }}
                          formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                        />
                        <Bar dataKey="revenue" radius={[0, 6, 6, 0]} barSize={24} isAnimationActive={!isGeneratingPDF}>
                          {stats.repStats.map((rep, index) => (
                            <Cell key={`${rep.name}-${index}`} fill={REP_COLORS[index % REP_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div id="market-share-card" className="flex min-w-0 flex-col rounded-[24px] border border-[#dfe3ea] bg-white p-5 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-[#18212d]">Market Share ({selectedMonth})</h2>
                  <div className="mb-6 h-[250px] w-full min-w-0 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.repStats} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="revenue" isAnimationActive={!isGeneratingPDF}>
                          {stats.repStats.map((rep, index) => (
                            <Cell key={`${rep.name}-pie-${index}`} fill={REP_COLORS[index % REP_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={`min-h-0 space-y-3 pr-1 ${isGeneratingPDF ? 'h-auto overflow-visible' : 'flex-1 overflow-y-auto'}`}>
                    {stats.repStats.map((rep, index) => {
                      const percentage = stats.totalRevenue === 0 ? 0 : (rep.revenue / stats.totalRevenue) * 100;
                      return (
                        <div key={rep.name} className="flex items-center justify-between rounded-xl border border-[#e6eaf0] bg-[#f7f9fc] p-3">
                          <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: REP_COLORS[index % REP_COLORS.length] }} />
                            <div>
                              <p className="text-sm font-semibold text-[#18212d]">{rep.name}</p>
                              <p className="text-xs text-[#6c7480]">{rep.orderCount} Orders</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-[#18212d]">{formatCurrency(rep.revenue)}</p>
                            <p className="text-xs text-[#6c7480]">{percentage.toFixed(1)}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-[#dfe3ea] bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-[#e3e7ee] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[#18212d]">Order Details ({selectedMonthLabel})</h2>
                    <p className="mt-1 text-sm text-[#5f6773]">Live order-level view deduplicated from the NY line-item feed.</p>
                  </div>
                  <div className={`flex items-center gap-2 ${isGeneratingPDF ? 'hidden' : ''}`}>
                    <input
                      type="checkbox"
                      id="showCanceled"
                      checked={showCanceled}
                      onChange={(event) => setShowCanceled(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#1d5eea] focus:ring-[#1d5eea]"
                    />
                    <label htmlFor="showCanceled" className="cursor-pointer text-sm text-[#4f5661]">
                      Show canceled orders
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#e5e7eb]">
                    <thead className="bg-[#f7f9fc]">
                      <tr>
                        {['Date', 'Order #', 'Customer', 'Rep', 'Status', 'Total'].map((label) => (
                          <th key={label} className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#6c7480] ${label === 'Total' ? 'text-right' : ''}`}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef1f5] bg-white">
                      {tableData.map((order) => (
                        <tr key={order.id} className={order.isCanceled ? 'opacity-60' : ''}>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-[#5f6773]">{order.createdDate.toLocaleDateString()}</td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-[#1d5eea]">#{order.orderNumber}</td>
                          <td className="px-5 py-4 text-sm text-[#243040]">
                            {order.matchedAccountId ? (
                              <Link href={`/accounts/${order.matchedAccountId}`} className="font-semibold text-[#1d5eea] hover:underline">
                                {order.customerName}
                              </Link>
                            ) : (
                              <span>{order.customerName}</span>
                            )}
                            <div className="mt-1 text-xs text-[#8a919c]">
                              {order.licensedLocationId ? `Licensed Location ID: ${order.licensedLocationId}` : 'No Licensed Location ID'}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-[#5f6773]">{order.salesRep}</td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className={order.isCanceled ? 'inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700' : 'inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700'}>
                              {order.status}
                            </span>
                          </td>
                          <td className={`whitespace-nowrap px-5 py-4 text-right text-sm font-semibold ${order.isCanceled ? 'text-[#8a919c] line-through' : 'text-[#18212d]'}`}>
                            {formatCurrency(order.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[24px] border border-[#dfe3ea] bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-medium text-[#6c7480]">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-[#18212d]">{value}</p>
        <p className="mt-1 text-sm font-medium text-[#1d5eea]">{helper}</p>
      </div>
      <div className={`rounded-full p-3 ${iconBg}`}>{icon}</div>
    </div>
  );
}

function InfoCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe3ea] bg-white/80 px-4 py-3 text-[#4f5661]">
      <span className="block text-xs uppercase tracking-[0.08em] text-[#8a919c]">{label}</span>
      <span className="mt-1 block font-semibold text-[#18212d]">{value}</span>
      {note ? <span className="mt-1 block text-xs text-[#6c7480]">{note}</span> : null}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <div className={tone === 'warning' ? 'mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800' : 'mt-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800'}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
