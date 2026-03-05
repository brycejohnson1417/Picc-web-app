'use client';

import { useMemo, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { currency, number } from '@/lib/utils';

type MetricsSource = {
  referrals: Array<{ createdAt: string }>;
  pennyBundles: Array<{ createdAt: string }>;
  overdue: Array<{ snapshotDate: string }>;
  sampleRequests: Array<{ createdAt: string }>;
  opportunities: Array<{ status: 'OPEN' | 'WON' | 'LOST'; value: number; updatedAt: string }>;
};

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function inRange(value: string, start: Date | null, end: Date | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function ReportsClient({ source }: { source: MetricsSource }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const metrics = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

    const referrals = source.referrals.filter((item) => inRange(item.createdAt, start, end)).length;
    const pennyBundles = source.pennyBundles.filter((item) => inRange(item.createdAt, start, end)).length;
    const overdue = source.overdue.filter((item) => inRange(item.snapshotDate, start, end)).length;
    const sampleRequests = source.sampleRequests.filter((item) => inRange(item.createdAt, start, end)).length;

    const openOpp = source.opportunities
      .filter((item) => item.status === 'OPEN')
      .filter((item) => inRange(item.updatedAt, start, end))
      .reduce((sum, item) => sum + item.value, 0);

    const wonOpp = source.opportunities
      .filter((item) => item.status === 'WON')
      .filter((item) => inRange(item.updatedAt, start, end))
      .reduce((sum, item) => sum + item.value, 0);

    const lostOpp = source.opportunities
      .filter((item) => item.status === 'LOST')
      .filter((item) => inRange(item.updatedAt, start, end))
      .reduce((sum, item) => sum + item.value, 0);

    return {
      referrals,
      pennyBundles,
      overdue,
      sampleRequests,
      openOpp,
      wonOpp,
      lostOpp,
    };
  }, [endDate, source, startDate]);

  const bars = [
    { label: 'Referrals', value: metrics.referrals },
    { label: 'Penny Bundles', value: metrics.pennyBundles },
    { label: 'Overdue Accounts', value: metrics.overdue },
    { label: 'Sample Requests', value: metrics.sampleRequests },
  ];
  const maxBar = Math.max(...bars.map((item) => item.value), 1);

  function exportCsv() {
    const rows = [
      ['Metric', 'Value'],
      ['Referrals', String(metrics.referrals)],
      ['Penny Bundles', String(metrics.pennyBundles)],
      ['Overdue Accounts', String(metrics.overdue)],
      ['Sample Requests', String(metrics.sampleRequests)],
      ['Open Opportunity Value', String(metrics.openOpp)],
      ['Won Opportunity Value', String(metrics.wonOpp)],
      ['Lost Opportunity Value', String(metrics.lostOpp)],
    ];

    const csv = rows.map((line) => line.map((cell) => csvEscape(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-sm text-slate-500">Date-range filtered workflow and opportunity reporting.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            Start
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10" />
          </label>
          <label className="text-xs text-slate-500">
            End
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10" />
          </label>
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <Button variant="outline" onClick={() => window.print()}>Export PDF</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportCard label="Referral Records" value={number(metrics.referrals)} />
        <ReportCard label="Penny Bundle Requests" value={number(metrics.pennyBundles)} />
        <ReportCard label="Overdue Accounts" value={number(metrics.overdue)} />
        <ReportCard label="Sample Box Requests" value={number(metrics.sampleRequests)} />
        <ReportCard label="Open Opportunity Value" value={currency(metrics.openOpp)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Volume</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{bar.label}</span>
                  <span>{number(bar.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(bar.value / maxBar) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Opportunity Value Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Open:</strong> {currency(metrics.openOpp)}</p>
            <p><strong>Won:</strong> {currency(metrics.wonOpp)}</p>
            <p><strong>Lost:</strong> {currency(metrics.lostOpp)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
