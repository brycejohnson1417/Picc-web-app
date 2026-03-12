import 'server-only';

import { prisma } from '@/lib/db/prisma';

function normalizePageId(value: string) {
  return value.replace(/-/g, '').trim().toLowerCase();
}

function withDashes(pageId: string) {
  const normalized = normalizePageId(pageId);
  if (normalized.length !== 32) {
    return pageId;
  }
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function isCuid(value: string) {
  return /^c[a-z0-9]{24}$/i.test(value.trim());
}

export async function resolveAccountIdentity(accountIdOrPageId: string, orgId?: string) {
  const raw = accountIdOrPageId.trim();
  if (!raw) {
    return null;
  }

  const dashedPageId = withDashes(raw);
  const normalizedPageId = normalizePageId(raw);

  if (isCuid(raw)) {
    const account = await prisma.account.findFirst({
      where: {
        id: raw,
        ...(orgId ? { orgId } : {}),
      },
      select: {
        id: true,
        orgId: true,
        notionPageId: true,
        name: true,
        licenseNumber: true,
      },
    });
    if (account) {
      if (!account.notionPageId) {
        const store = await prisma.territoryStoreReadModel.findFirst({
          where: {
            ...(orgId ? { orgId } : {}),
            OR: [
              ...(account.licenseNumber ? [{ licenseNumber: account.licenseNumber }] : []),
              { name: account.name },
            ],
          },
          select: { notionPageId: true, orgId: true },
        });

        if (store?.notionPageId) {
          return {
            accountId: account.id,
            orgId: store.orgId,
            notionPageId: store.notionPageId,
          };
        }
      }

      return {
        accountId: account.id,
        orgId: account.orgId,
        notionPageId: account.notionPageId ?? null,
      };
    }
  }

  const accountByNotionId = await prisma.account.findFirst({
    where: {
      ...(orgId ? { orgId } : {}),
      OR: [{ notionPageId: raw }, { notionPageId: dashedPageId }],
    },
    select: {
      id: true,
      orgId: true,
      notionPageId: true,
    },
  });

  if (accountByNotionId) {
    return {
      accountId: accountByNotionId.id,
      orgId: accountByNotionId.orgId,
      notionPageId: accountByNotionId.notionPageId ?? dashedPageId,
    };
  }

  const store = await prisma.territoryStoreReadModel.findFirst({
    where: {
      ...(orgId ? { orgId } : {}),
      OR: [{ id: raw }, { id: dashedPageId }, { notionPageId: raw }, { notionPageId: dashedPageId }],
    },
    select: {
      id: true,
      notionPageId: true,
      orgId: true,
      name: true,
      licenseNumber: true,
    },
  });

  if (!store) {
    return {
      accountId: null,
      orgId: orgId ?? null,
      notionPageId: normalizedPageId.length === 32 ? dashedPageId : null,
    };
  }

  const accountByStore = await prisma.account.findFirst({
    where: {
      ...(orgId ? { orgId } : {}),
      OR: [
        { notionPageId: store.notionPageId },
        ...(store.licenseNumber ? [{ licenseNumber: store.licenseNumber }] : []),
        { name: store.name },
      ],
    },
    select: { id: true, orgId: true },
  });

  return {
    accountId: accountByStore?.id ?? null,
    orgId: accountByStore?.orgId ?? store.orgId,
    notionPageId: store.notionPageId ?? null,
  };
}
