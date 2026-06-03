'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type PreferredPartnerRepDatum = {
  name: string;
  count: number;
};

export function PreferredPartnerRepChart({
  data,
}: {
  data: PreferredPartnerRepDatum[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[20px] border border-dashed border-[#d6dbe4] bg-[#f8fafc] px-4 text-sm text-[#5c6674]">
        No preferred partners are synced yet.
      </div>
    );
  }

  const height = Math.max(240, data.length * 52);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#5c6674' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={132}
            tick={{ fontSize: 12, fill: '#18212d' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: '#eef2f7' }}
            contentStyle={{ borderRadius: 16, borderColor: '#d6dbe4' }}
            formatter={(value: number) => [`${value}`, 'Preferred Partners']}
          />
          <Bar dataKey="count" radius={[0, 10, 10, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.name === 'Unassigned' ? '#64748b' : '#18212d'} />
            ))}
            <LabelList dataKey="count" position="right" fill="#18212d" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
