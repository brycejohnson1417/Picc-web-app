'use client';

import { Button } from '@/components/ui';
import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

export default function TasksError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Tasks page error:', error);
  }, [error]);

  return (
    <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center sm:p-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mb-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Failed to load tasks</h2>
      <p className="mt-2 text-sm text-slate-500 max-w-sm">
        There was an error retrieving the task queue. Please try again.
      </p>
      <div className="mt-6">
        <Button onClick={() => reset()} variant="outline">
          Try again
        </Button>
      </div>
    </div>
  );
}
