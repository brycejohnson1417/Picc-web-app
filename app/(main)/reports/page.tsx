import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { getPayrollOverview } from '@/lib/server/payroll';
import { getVendorDayReportSummary } from '@/lib/server/roi';

function currency(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function number(value: number) {
  return value.toLocaleString();
}

export default async function ReportsPage() {
  const { orgId } = await requireWorkspaceContext();
  const [report, payroll] = await Promise.all([getVendorDayReportSummary({ orgId }), getPayrollOverview(orgId)]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="rounded-[28px] border border-[#d8d9de] bg-[linear-gradient(135deg,#fff5ef_0%,#ffffff_42%,#f4f7fb_100%)] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c93412]">Vendor Day Reporting</p>
        <h1 className="mt-2 text-3xl font-bold text-[#17181c]">ROI, payroll, and utilization</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#5d6470]">
          This page is now driven by local payroll and ROI snapshots rather than generic CRM counts.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ReportCard label="Revenue Lift" value={currency(report.totals.revenueLift)} />
        <ReportCard label="Order Lift" value={number(report.totals.orderLift)} />
        <ReportCard label="Labor Cost" value={currency(report.totals.laborCost)} />
        <ReportCard label="Travel Cost" value={currency(report.totals.travelCost)} />
        <ReportCard label="Service Cost" value={currency(report.totals.serviceCompanyCost)} />
        <ReportCard label="Credit Exposure" value={currency(report.totals.creditExposure)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[#d8d9de]">
          <CardHeader>
            <CardTitle>BA Utilization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.byWorker.length === 0 ? <p className="text-sm text-[#66707d]">No worker ROI or payroll records yet.</p> : null}
            {report.byWorker.map((worker) => (
              <div key={worker.label} className="rounded-2xl border border-[#e0e3ea] bg-[#fbfcfe] px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-[#17181c]">{worker.label}</p>
                    <p className="text-sm text-[#66707d]">{worker.events} events · {worker.travelMinutes} travel minutes</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#17181c]">{currency(worker.pay)}</p>
                    <p className="text-xs text-[#66707d]">{currency(worker.revenueLift)} revenue lift</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-[#d8d9de]">
            <CardHeader>
              <CardTitle>Current Payroll Batch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payroll.currentBatch ? (
                <>
                  <p className="text-sm text-[#66707d]">
                    {new Date(payroll.currentBatch.startsOn).toLocaleDateString()} to {new Date(payroll.currentBatch.endsOn).toLocaleDateString()} · {payroll.currentBatch.status.replaceAll('_', ' ')}
                  </p>
                  <p className="text-2xl font-bold text-[#17181c]">{number(payroll.currentBatch.lineItems.length)} line items</p>
                  <p className="text-sm text-[#66707d]">
                    {currency(
                      payroll.currentBatch.lineItems.reduce((sum, line) => sum + Number(line.totalPayAmount ?? 0), 0),
                    )}{' '}
                    queued for payout
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#66707d]">No payroll batch yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#d8d9de]">
            <CardHeader>
              <CardTitle>Brand Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.byBrand.length === 0 ? <p className="text-sm text-[#66707d]">No brand-tagged ROI records yet.</p> : null}
              {report.byBrand.map((brand) => (
                <div key={brand.label} className="flex items-center justify-between rounded-2xl border border-[#e0e3ea] bg-[#fbfcfe] px-4 py-3">
                  <div>
                    <p className="font-semibold text-[#17181c]">{brand.label}</p>
                    <p className="text-sm text-[#66707d]">{brand.events} events</p>
                  </div>
                  <p className="text-sm font-semibold text-[#17181c]">{currency(brand.revenueLift)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-[#d8d9de]">
        <CardHeader>
          <CardTitle>Recent Vendor Day ROI Snapshots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.snapshots.length === 0 ? <p className="text-sm text-[#66707d]">No completed vendor-day ROI snapshots yet.</p> : null}
          {report.snapshots.slice(0, 20).map((snapshot) => (
            <div key={snapshot.id} className="rounded-2xl border border-[#e0e3ea] bg-[#fbfcfe] px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-[#17181c]">{snapshot.account.name}</p>
                  <p className="text-sm text-[#66707d]">
                    {snapshot.workerProfile?.displayName ?? 'Unassigned'} · {snapshot.windowDays}-day window
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[#17181c]">{currency(Number(snapshot.revenueLift ?? 0))}</p>
                  <p className="text-xs text-[#66707d]">ROI {snapshot.roiMultiple ? Number(snapshot.roiMultiple).toFixed(2) : '—'}x</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-[#d8d9de]">
      <CardHeader>
        <CardTitle className="text-sm text-[#66707d]">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-[#17181c]">{value}</p>
      </CardContent>
    </Card>
  );
}
