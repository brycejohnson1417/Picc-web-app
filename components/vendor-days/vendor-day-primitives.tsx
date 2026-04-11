'use client';

import { Card, CardContent } from '@/components/ui';

export function SectionEmpty({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[#d8deea] bg-[#f8fafc] p-6 text-sm text-[#5d6672]">
      <p className="font-semibold text-[#17202c]">{title}</p>
      <p className="mt-2 leading-6">{body}</p>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warm';
}) {
  return (
    <Card className={tone === 'warm' ? 'border-[#eadfd8] bg-[#fffaf6]' : 'border-[#dce3eb] bg-white/95'}>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8593]">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-[#18212d]">{value}</p>
      </CardContent>
    </Card>
  );
}
