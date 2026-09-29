import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';

export async function POST() {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  return NextResponse.json(
    { error: 'Team directory sync is unavailable. No memberships were changed.' },
    { status: 501, headers: { 'Cache-Control': 'no-store' } },
  );
}
