import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: Request) {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (!q) {
    return NextResponse.json({ accounts: [], contacts: [], actions: [] });
  }

  const [accounts, contacts] = await Promise.all([
    prisma.account.findMany({
      where: { orgId: ctx.orgId, name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 12,
    }),
    prisma.contact.findMany({
      where: {
        orgId: ctx.orgId,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      take: 12,
    }),
  ]);

  return NextResponse.json({
    accounts,
    contacts,
    actions: [
      { id: 'new-account', label: 'Create new dispensary', href: '/accounts?new=1' },
      { id: 'new-contact', label: 'Create new contact', href: '/contacts?new=1' },
      { id: 'new-task', label: 'Create new task', href: '/tasks?new=1' },
    ],
  });
}
