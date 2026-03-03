import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { ActivityTimeline } from '@/components/crm/activity-timeline';
import { AccountGrowthChartLazy, PipelineStageChartLazy } from '@/components/crm/dashboard-charts-lazy';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { currency, number } from '@/lib/utils';
import { getDashboardData } from '@/lib/data/queries';
import Link from 'next/link';

export default async function DashboardPage() {
  const { orgId } = await requireWorkspaceContext();

  const data = await getDashboardData(orgId);

  const growthSeries = [
    { month: 'Jul', value: 312 },
    { month: 'Aug', value: 352 },
    { month: 'Sep', value: 398 },
    { month: 'Oct', value: 456 },
    { month: 'Nov', value: 512 },
    { month: 'Dec', value: 629 },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-r from-blue-600 to-blue-500 p-6 text-white">
        <h1 className="text-3xl font-bold">Command Center</h1>
        <p className="mt-2 text-blue-100">Track referrals, vendor days, overdue risk, and sample-box workflows from one account-first workspace.</p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total Active Dispensaries" value={number(data.activeAccounts)} trend="+12%" href="/accounts" />
        <KpiCard title="Open Opportunity Value" value={currency(Number(data.openOppValue))} trend="+8.4%" href="/pipelines" />
        <KpiCard title="Avg Response Time" value={data.avgResponseTime} trend="-18 min" href="/conversations" />
        <KpiCard title="Upcoming Follow-ups" value={number(data.upcomingFollowUps)} trend="This week" href="/tasks" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Pipeline by Stage</CardTitle>
              <CardDescription>Open opportunities grouped by current stage.</CardDescription>
            </div>
            <Link href="/pipelines" className="text-sm font-medium text-blue-600 hover:underline">View Pipeline</Link>
          </CardHeader>
          <CardContent>
            <PipelineStageChartLazy data={data.pipelineByStage} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Store Growth</CardTitle>
              <CardDescription>Active account growth over recent months.</CardDescription>
            </div>
            <Link href="/reports" className="text-sm font-medium text-blue-600 hover:underline">Reports</Link>
          </CardHeader>
          <CardContent>
            <AccountGrowthChartLazy data={growthSeries} />
          </CardContent>
        </Card>
      </section>

      <ActivityTimeline items={data.recentActivity} />
    </div>
  );
}

function KpiCard({ title, value, trend, href }: { title: string; value: string; trend: string; href?: string }) {
  const content = (
    <Card className={href ? 'transition-all hover:border-blue-300 hover:bg-slate-50/50' : ''}>
      <CardHeader className="pb-2">
        <CardDescription className="text-sm font-medium text-slate-500">{title}</CardDescription>
        <CardTitle className="text-3xl font-bold tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary" className="font-semibold">{trend}</Badge>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
