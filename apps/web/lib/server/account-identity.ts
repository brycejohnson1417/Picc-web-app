import 'server-only';

import { AccountIdentityType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

function normalizePageId(value: string) {
  return value.replace(/-/g, '').trim().toLowerCase();
}

function withDashes(pageId: string) {
  const normalized = normalizePageId(pageId);
  if (normalized.length !== 32) {
    return pageId.trim();
  }
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function isCuid(value: string) {
  return /^c[a-z0-9]{24}$/i.test(value.trim());
}

export function normalizeIdentityValue(type: AccountIdentityType, value: string) {
  const trimmed = value.trim();

  switch (type) {
    case AccountIdentityType.NOTION_PAGE_ID:
      return normalizePageId(trimmed);
    case AccountIdentityType.ACCOUNT_ID:
      return trimmed;
    default:
      return trimmed.toUpperCase().replace(/\s+/g, ' ');
  }
}

export async function upsertAccountIdentityMapping(input: {
  orgId: string;
  accountId?: string | null;
  identityType: AccountIdentityType;
  identityValue: string;
  source?: string;
  isOverride?: boolean;
  active?: boolean;
  actorClerkUserId?: string | null;
  actorEmail?: string | null;
}) {
  const identityValue = input.identityValue.trim();
  if (!identityValue) {
    return null;
  }

  const normalizedValue = normalizeIdentityValue(input.identityType, identityValue);

  return prisma.accountIdentityMapping.upsert({
    where: {
      orgId_identityType_normalizedValue: {
        orgId: input.orgId,
        identityType: input.identityType,
        normalizedValue,
      },
    },
    update: {
      accountId: input.accountId ?? null,
      identityValue,
      source: input.source ?? 'SYSTEM',
      isOverride: input.isOverride ?? false,
      active: input.active ?? true,
      createdByClerkUserId: input.actorClerkUserId ?? null,
      createdByEmail: input.actorEmail ?? null,
    },
    create: {
      orgId: input.orgId,
      accountId: input.accountId ?? null,
      identityType: input.identityType,
      identityValue,
      normalizedValue,
      source: input.source ?? 'SYSTEM',
      isOverride: input.isOverride ?? false,
      active: input.active ?? true,
      createdByClerkUserId: input.actorClerkUserId ?? null,
      createdByEmail: input.actorEmail ?? null,
    },
  });
}

export async function ensureAccountIdentityMappings(input: {
  orgId: string;
  accountId?: string | null;
  notionPageId?: string | null;
  licensedLocationId?: string | null;
  nabisRetailerId?: string | null;
  licenseNumber?: string | null;
  aliases?: string[];
  source?: string;
  actorClerkUserId?: string | null;
  actorEmail?: string | null;
}) {
  const work = [
    input.accountId
      ? upsertAccountIdentityMapping({
          orgId: input.orgId,
          accountId: input.accountId,
          identityType: AccountIdentityType.ACCOUNT_ID,
          identityValue: input.accountId,
          source: input.source,
          actorClerkUserId: input.actorClerkUserId,
          actorEmail: input.actorEmail,
        })
      : null,
    input.notionPageId
      ? upsertAccountIdentityMapping({
          orgId: input.orgId,
          accountId: input.accountId,
          identityType: AccountIdentityType.NOTION_PAGE_ID,
          identityValue: input.notionPageId,
          source: input.source,
          actorClerkUserId: input.actorClerkUserId,
          actorEmail: input.actorEmail,
        })
      : null,
    input.licensedLocationId
      ? upsertAccountIdentityMapping({
          orgId: input.orgId,
          accountId: input.accountId,
          identityType: AccountIdentityType.LICENSED_LOCATION_ID,
          identityValue: input.licensedLocationId,
          source: input.source,
          actorClerkUserId: input.actorClerkUserId,
          actorEmail: input.actorEmail,
        })
      : null,
    input.nabisRetailerId
      ? upsertAccountIdentityMapping({
          orgId: input.orgId,
          accountId: input.accountId,
          identityType: AccountIdentityType.NABIS_RETAILER_ID,
          identityValue: input.nabisRetailerId,
          source: input.source,
          actorClerkUserId: input.actorClerkUserId,
          actorEmail: input.actorEmail,
        })
      : null,
    input.licenseNumber
      ? upsertAccountIdentityMapping({
          orgId: input.orgId,
          accountId: input.accountId,
          identityType: AccountIdentityType.LICENSE_NUMBER,
          identityValue: input.licenseNumber,
          source: input.source,
          actorClerkUserId: input.actorClerkUserId,
          actorEmail: input.actorEmail,
        })
      : null,
    ...(input.aliases ?? []).map((alias) =>
      upsertAccountIdentityMapping({
        orgId: input.orgId,
        accountId: input.accountId,
        identityType: AccountIdentityType.ALIAS,
        identityValue: alias,
        source: input.source,
        actorClerkUserId: input.actorClerkUserId,
        actorEmail: input.actorEmail,
      }),
    ),
  ].filter(Boolean);

  await Promise.all(work);
}

async function findAccountByIdentity(orgId: string, type: AccountIdentityType, value: string) {
  const mapping = await prisma.accountIdentityMapping.findFirst({
    where: {
      orgId,
      identityType: type,
      normalizedValue: normalizeIdentityValue(type, value),
      active: true,
    },
    include: {
      account: {
        select: {
          id: true,
          orgId: true,
          notionPageId: true,
          name: true,
          licenseNumber: true,
          licensedLocationId: true,
        },
      },
    },
    orderBy: [{ isOverride: 'desc' }, { updatedAt: 'desc' }],
  });

  return mapping?.account ?? null;
}

export async function resolveCanonicalAccountByIdentifiers(input: {
  orgId: string;
  accountId?: string | null;
  notionPageId?: string | null;
  licensedLocationId?: string | null;
  nabisRetailerId?: string | null;
  licenseNumber?: string | null;
  alias?: string | null;
}) {
  const { orgId } = input;

  const attempts: Array<[AccountIdentityType, string | null | undefined]> = [
    [AccountIdentityType.LICENSED_LOCATION_ID, input.licensedLocationId],
    [AccountIdentityType.ACCOUNT_ID, input.accountId],
    [AccountIdentityType.NOTION_PAGE_ID, input.notionPageId],
    [AccountIdentityType.NABIS_RETAILER_ID, input.nabisRetailerId],
    [AccountIdentityType.LICENSE_NUMBER, input.licenseNumber],
    [AccountIdentityType.ALIAS, input.alias],
  ];

  for (const [type, value] of attempts) {
    if (!value?.trim()) continue;
    const account = await findAccountByIdentity(orgId, type, value);
    if (account) {
      return account;
    }
  }

  return null;
}

export async function resolveAccountIdentity(accountIdOrPageId: string, orgId?: string) {
  const raw = accountIdOrPageId.trim();
  if (!raw) {
    return null;
  }

  if (orgId) {
    const mapped = await resolveCanonicalAccountByIdentifiers({
      orgId,
      accountId: isCuid(raw) ? raw : null,
      notionPageId: raw,
      licensedLocationId: raw,
      nabisRetailerId: raw,
      licenseNumber: raw,
      alias: raw,
    });

    if (mapped) {
      return {
        accountId: mapped.id,
        orgId: mapped.orgId,
        notionPageId: mapped.notionPageId ?? null,
      };
    }
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
