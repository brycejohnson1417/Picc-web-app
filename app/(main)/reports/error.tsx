'use client';

import { Button } from '@/components/ui';
import { WorkspaceHero, WorkspacePage } from '@/components/layout/workspace-page';
import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

export default function ReportsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Reports page error:', error);
  }, [error]);

  return (
    <WorkspacePage>
      <WorkspaceHero
        eyebrow="Vendor Day Reporting"
        title="ROI, payroll, and utilization in one reporting surface."
        description="Reporting should read like the rest of the operating system. These metrics are driven by local payroll and ROI snapshots rather than generic CRM counts."
      />
      <div className="flex h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#e0e3ea] bg-[#fbfcfe] p-8 text-center sm:p-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-[#17181c]">Failed to load reports</h2>
        <p className="mt-2 text-sm text-[#66707d] max-w-sm">
          There was an error generating the reporting data. Please try again or check your data sources.
        </p>
        <div className="mt-6">
          <Button onClick={() => reset()} variant="outline">
            Try again
          </Button>
        </div>
      </div>
    </WorkspacePage>
  );
}
