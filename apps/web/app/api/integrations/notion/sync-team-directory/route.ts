import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

const roleMap: Record<string, Role> = {
  ADMIN: Role.ADMIN,
  OPS_TEAM: Role.OPS_TEAM,
  SALES_REP: Role.SALES_REP,
  FINANCE: Role.FINANCE,
  BRAND_AMBASSADOR: Role.BRAND_AMBASSADOR,
};

export async function POST() {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  // In production, replace this with Notion DB query ingestion.
  // This endpoint is intentionally executable and updates memberships deterministically.
  const mockNotionRows = [
    { clerkUserId: 'user_admin', role: 'ADMIN' },
    { clerkUserId: 'user_ops', role: 'OPS_TEAM' },
    { clerkUserId: 'user_sales_1', role: 'SALES_REP' },
    { clerkUserId: 'user_finance', role: 'FINANCE' },
    { clerkUserId: 'user_ba', role: 'BRAND_AMBASSADOR' },
  ];

  for (const row of mockNotionRows) {
    await prisma.membership.upsert({
      where: {
        orgId_clerkUserId: {
          orgId: ctx.orgId,
          clerkUserId: row.clerkUserId,
        },
      },
      update: {
        role: roleMap[row.role],
        source: 'NOTION_SYNC',
        active: true,
      },
      create: {
        orgId: ctx.orgId,
        clerkUserId: row.clerkUserId,
        role: roleMap[row.role],
        source: 'NOTION_SYNC',
        active: true,
      },
    });
  }

  return NextResponse.json({ synced: mockNotionRows.length });
}
