import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-12 w-1/2" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-[360px]" />
    </div>
  );
}
