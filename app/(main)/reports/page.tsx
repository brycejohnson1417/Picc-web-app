import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';
import { currency, number } from '@/lib/utils';
import { Download, Share2, FileText, BarChart3 } from 'lucide-react';
import { ClientActionButton } from '@/components/crm/client-action-button';

export default async function ReportsPage() {
  const { orgId } = await requireWorkspaceContext();

  const [referrals, pennyBundles, overdue, sampleRequests, openOpp] = await Promise.all([
    prisma.referralRecord.count({ where: { orgId } }),
    prisma.pennyBundleCreditSubmission.count({ where: { orgId } }),
    prisma.overdueSnapshot.count({ where: { orgId, OR: [{ daysOverdue1: { gt: 0 } }, { daysOverdue2: { gt: 0 } }, { daysOverdue3: { gt: 0 } }] } }),
    prisma.sampleBoxRequest.count({ where: { orgId } }),
    prisma.opportunity.aggregate({ where: { orgId, status: 'OPEN' }, _sum: { value: true } }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-slate-500">Revenue forecasting, source attribution, and workflow health snapshots.</p>
        </div>
        <div className="flex gap-2">
          <ClientActionButton label="Share" actionMessage="Sharing report link coming soon" variant="outline" size="md" className="h-10 px-4 flex gap-2">
             <Share2 className="h-4 w-4" /> Share
          </ClientActionButton>
          <ClientActionButton label="Download PDF" actionMessage="Generating PDF report coming soon" variant="default" size="md" className="h-10 px-4 flex gap-2">
             <Download className="h-4 w-4" /> Download PDF
          </ClientActionButton>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportCard label="Referral Records" value={number(referrals)} icon={<FileText className="h-4 w-4 text-blue-500" />} />
        <ReportCard label="Penny Bundle Requests" value={number(pennyBundles)} icon={<BarChart3 className="h-4 w-4 text-green-500" />} />
        <ReportCard label="Overdue Accounts" value={number(overdue)} icon={<BarChart3 className="h-4 w-4 text-red-500" />} />
        <ReportCard label="Sample Box Requests" value={number(sampleRequests)} icon={<FileText className="h-4 w-4 text-purple-500" />} />
        <ReportCard label="Open Opportunity Value" value={currency(Number(openOpp._sum.value || 0))} icon={<BarChart3 className="h-4 w-4 text-orange-500" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Revenue Sources</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-dashed">
            <p className="text-sm text-slate-500">Revenue source chart placeholder</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workflow Efficiency</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-dashed">
            <p className="text-sm text-slate-500">Efficiency metrics chart placeholder</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
