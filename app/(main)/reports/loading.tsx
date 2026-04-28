import { Card, CardContent, CardHeader, Skeleton } from '@/components/ui';
import { WorkspaceHero, WorkspacePage } from '@/components/layout/workspace-page';

export default function ReportsLoading() {
  return (
    <WorkspacePage>
      <WorkspaceHero
        eyebrow="Vendor Day Reporting"
        title="ROI, payroll, and utilization in one reporting surface."
        description="Reporting should read like the rest of the operating system. These metrics are driven by local payroll and ROI snapshots rather than generic CRM counts."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-[#d8d9de]">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[#d8d9de]">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-[#d8d9de]">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>

          <Card className="border-[#d8d9de]">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-[#d8d9de]">
        <CardHeader>
          <Skeleton className="h-6 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
