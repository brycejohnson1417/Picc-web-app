import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { inspectNabisWorkbook } from '@/lib/integrations/sheets';
import { NABIS_SCHEMA_MAPPING, REQUIRED_NABIS_TABS } from '@/lib/data/sheets-schema';

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  const path = process.env.NABIS_MASTER_SHEET_PATH || '/Users/brycejohnson/Downloads/Nabis Notion Master Sheet.xlsx';

  try {
    const data = inspectNabisWorkbook(path);
    return NextResponse.json({ path, ...data });
  } catch (error) {
    return NextResponse.json({
      path,
      fallback: true,
      warning: 'Workbook file not accessible in this environment. Returning mapped schema only.',
      details: (error as Error).message,
      tabs: [],
      requiredCoverage: REQUIRED_NABIS_TABS.map((tab) => ({
        tab,
        present: false,
        mapping: NABIS_SCHEMA_MAPPING[tab as keyof typeof NABIS_SCHEMA_MAPPING] || null,
      })),
      sample: [],
    });
  }
}
