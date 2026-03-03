import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { ActivityTimeline } from '@/components/crm/activity-timeline';
import { AccountGrowthChartLazy, PipelineStageChartLazy } from '@/components/crm/dashboard-charts-lazy';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { currency, number } from '@/lib/utils';
import { getDashboardData } from '@/lib/data/queries';

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
        <KpiCard title="Total Active Dispensaries" value={number(data.activeAccounts)} trend="+12%" />
        <KpiCard title="Open Opportunity Value" value={currency(Number(data.openOppValue))} trend="+8.4%" />
        <KpiCard title="Avg Response Time" value={data.avgResponseTime} trend="-18 min" />
        <KpiCard title="Upcoming Follow-ups" value={number(data.upcomingFollowUps)} trend="This week" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline by Stage</CardTitle>
            <CardDescription>Open opportunities grouped by current stage.</CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineStageChartLazy data={data.pipelineByStage} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Store Growth</CardTitle>
            <CardDescription>Active account growth over recent months.</CardDescription>
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

function KpiCard({ title, value, trend }: { title: string; value: string; trend: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary">{trend}</Badge>
      </CardContent>
    </Card>
  );
}
