import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export interface NotionCacheSnapshot<T> {
  key: string;
  payload: T;
  recordsRead: number;
  unresolvedLocationCount: number;
  lastEditedMax: string | null;
  syncedAt: string;
}

function asIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export async function readNotionCacheSnapshot<T>(key: string): Promise<NotionCacheSnapshot<T> | null> {
  const row = await prisma.notionCacheSnapshot.findUnique({
    where: { key },
  });

  if (!row) {
    return null;
  }

  return {
    key: row.key,
    payload: row.payload as T,
    recordsRead: Number(row.recordsRead ?? 0),
    unresolvedLocationCount: Number(row.unresolvedLocationCount ?? 0),
    lastEditedMax: asIsoString(row.lastEditedMax),
    syncedAt: asIsoString(row.syncedAt) ?? new Date().toISOString(),
  };
}

export async function writeNotionCacheSnapshot<T>(input: {
  key: string;
  payload: T;
  recordsRead: number;
  unresolvedLocationCount?: number;
  lastEditedMax?: string | null;
}) {
  await prisma.notionCacheSnapshot.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      payload: input.payload as Prisma.InputJsonValue,
      recordsRead: Math.max(0, Math.trunc(input.recordsRead)),
      unresolvedLocationCount: Math.max(0, Math.trunc(input.unresolvedLocationCount ?? 0)),
      lastEditedMax: input.lastEditedMax ? new Date(input.lastEditedMax) : null,
      syncedAt: new Date(),
    },
    update: {
      payload: input.payload as Prisma.InputJsonValue,
      recordsRead: Math.max(0, Math.trunc(input.recordsRead)),
      unresolvedLocationCount: Math.max(0, Math.trunc(input.unresolvedLocationCount ?? 0)),
      lastEditedMax: input.lastEditedMax ? new Date(input.lastEditedMax) : null,
      syncedAt: new Date(),
    },
  });
}

export function isSnapshotStale(syncedAt: string | null | undefined, ttlMinutes: number) {
  if (!syncedAt) {
    return true;
  }
  const syncedAtMs = Date.parse(syncedAt);
  if (!Number.isFinite(syncedAtMs)) {
    return true;
  }

  const ttlMs = Math.max(1, ttlMinutes) * 60_000;
  return Date.now() - syncedAtMs > ttlMs;
}

export function getSyncTtlMinutes(defaultMinutes: number) {
  const raw = process.env.NOTION_SYNC_TTL_MINUTES?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return defaultMinutes;
}
