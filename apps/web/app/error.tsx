'use client';

import { Button } from '@/components/ui';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-h1 font-bold">Something went wrong</h1>
      <p className="max-w-md text-slate-500">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
