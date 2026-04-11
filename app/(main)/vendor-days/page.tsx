import { VendorDayWorkspace } from '@/components/vendor-days/vendor-day-workspace';

export default async function VendorDaysPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const view = typeof params?.view === 'string' ? params.view : undefined;
  return <VendorDayWorkspace initialView={view} />;
}
