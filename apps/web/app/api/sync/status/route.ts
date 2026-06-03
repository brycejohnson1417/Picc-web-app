import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { getNabisAdminSyncStatus } from '@/lib/server/nabis-sync-status';

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  const status = await getNabisAdminSyncStatus(ctx.orgId);

  return NextResponse.json(status);
}
