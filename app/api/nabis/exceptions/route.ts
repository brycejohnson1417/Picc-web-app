import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { getNabisExceptionWorkspace } from '@/lib/server/nabis-exceptions';

export async function GET(request: NextRequest) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  const query = request.nextUrl.searchParams.get('query') ?? '';
  const workspace = await getNabisExceptionWorkspace(ctx.orgId, query);

  return NextResponse.json(workspace);
}
