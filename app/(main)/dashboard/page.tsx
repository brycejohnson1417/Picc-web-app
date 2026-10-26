import { NabisSalesDashboard } from '@/components/dashboard/nabis-sales-dashboard';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return <><div className="px-4 py-3"><a href="/distru" className="text-sm font-medium text-primary underline">Open Distru sales &amp; Sales NY credit</a></div><NabisSalesDashboard /></>;
}
