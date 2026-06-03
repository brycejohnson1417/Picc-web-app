import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-h1 font-bold">Page not found</h1>
      <p className="max-w-md text-slate-500">The page you requested doesn’t exist in this workspace.</p>
      <Button asChild>
        <Link href="/territory">Go to territory</Link>
      </Button>
    </div>
  );
}
