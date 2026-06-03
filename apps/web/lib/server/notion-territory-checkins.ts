import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import type { TerritoryStoreCheckIn, TerritoryStorePin } from '@/lib/territory/types';

type NotionTextSegment = {
  plain_text?: string;
};

type NotionPerson = {
  name?: string | null;
  person?: {
    email?: string | null;
  } | null;
};

type NotionComment = {
  id: string;
  discussion_id?: string | null;
  created_time: string;
  last_edited_time?: string;
  created_by?: NotionPerson | null;
  display_name?: {
    resolved_name?: string | null;
    custom?: {
      name?: string | null;
    } | null;
  } | null;
  rich_text?: NotionTextSegment[];
};

type NotionCommentListResponse = {
  results?: NotionComment[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type NotionPropertySchema = {
  id: string;
  type: string;
};

type TerritoryCheckInServiceDeps = {
  notionRequest: <T>(path: string, init?: RequestInit, attempt?: number) => Promise<T>;
  getTerritorySnapshot: (input?: { maxLiveGeocodeLookups?: number }) => Promise<{ stores: TerritoryStorePin[] }>;
  loadTerritoryStoreFromReadModel: (storeId: string) => Promise<TerritoryStorePin | null>;
  patchStoreInSnapshot: (storeId: string, updater: (store: TerritoryStorePin) => TerritoryStorePin) => Promise<void>;
  patchTerritoryStoreReadModel: (storeId: string, payload: { lastCheckIn?: string }) => Promise<unknown>;
  recordTerritoryCheckInEvent: (input: {
    storeId: string;
    contactId?: string | null;
    lat: number;
    lng: number;
    noteText: string;
    createdByEmail?: string | null;
    happenedAt: string;
  }) => Promise<unknown>;
  fetchAndValidateDatabaseSchema: () => Promise<{ database: { properties?: Record<string, NotionPropertySchema> } }>;
  pickPropertyNameByType: (
    properties: Record<string, NotionPropertySchema>,
    candidates: string[],
    requiredType: string,
  ) => string | null;
  territoryOrgId: () => string;
};

function textFromRichTextSegments(segments: NotionTextSegment[] | undefined) {
  return (segments ?? []).map((segment) => segment?.plain_text ?? '').join('').trim();
}

function normalizePageId(value: string) {
  return value.replace(/-/g, '').toLowerCase();
}

function findStoreById(stores: TerritoryStorePin[], storeId: string) {
  const normalizedStoreId = normalizePageId(storeId);
  return (
    stores.find((store) => normalizePageId(store.id) === normalizedStoreId || normalizePageId(store.notionPageId) === normalizedStoreId) ??
    null
  );
}

function inferCheckInMode(noteText: string | null | undefined): 'written' | 'voice' | 'unknown' {
  const normalized = (noteText ?? '').toLowerCase();
  if (!normalized) {
    return 'unknown';
  }
  if (normalized.includes('voice')) {
    return 'voice';
  }
  return 'written';
}

function extractActorEmailFromCommentText(noteText: string | null | undefined) {
  if (!noteText) {
    return null;
  }

  const match = noteText.match(/(?:^|\n)By:\s+([^\n]+)/i);
  const candidate = match?.[1]?.trim() ?? '';
  if (!candidate || !candidate.includes('@')) {
    return null;
  }
  return candidate;
}

function commentAuthorLabel(comment: NotionComment, noteText: string | null | undefined) {
  const explicitActor = extractActorEmailFromCommentText(noteText);
  if (explicitActor) {
    return explicitActor;
  }

  const displayName = comment.display_name?.resolved_name?.trim() || comment.display_name?.custom?.name?.trim();
  if (displayName) {
    return displayName;
  }

  const personEmail = comment.created_by?.person?.email?.trim();
  if (personEmail) {
    return personEmail;
  }

  const personName = comment.created_by?.name?.trim();
  return personName || null;
}

async function listNotionCommentsForPage(
  notionRequest: TerritoryCheckInServiceDeps['notionRequest'],
  pageId: string,
  limit: number,
): Promise<NotionComment[]> {
  const normalizedLimit = Math.min(Math.max(limit, 1), 100);
  const results: NotionComment[] = [];
  let nextCursor: string | null = null;

  while (results.length < normalizedLimit) {
    const searchParams = new URLSearchParams({
      block_id: pageId,
      page_size: String(Math.min(100, normalizedLimit - results.length)),
    });

    if (nextCursor) {
      searchParams.set('start_cursor', nextCursor);
    }

    const response = await notionRequest<NotionCommentListResponse>(`/comments?${searchParams.toString()}`);
    const comments = Array.isArray(response.results) ? response.results : [];

    for (const comment of comments) {
      results.push(comment);
      if (results.length >= normalizedLimit) {
        break;
      }
    }

    if (!response.has_more || !response.next_cursor) {
      break;
    }

    nextCursor = response.next_cursor;
  }

  return results;
}

function mapMirroredCheckInRow(row: {
  notionCommentId: string;
  source: string;
  happenedAt: Date;
  mode: string;
  noteText: string | null;
  notionPageId: string;
  createdByLabel: string | null;
  createdByEmail: string | null;
}) {
  return {
    id: row.notionCommentId,
    source: row.source === 'notion-comment' ? 'notion-comment' : 'local-check-in',
    happenedAt: row.happenedAt.toISOString(),
    mode: row.mode === 'voice' || row.mode === 'written' ? row.mode : 'unknown',
    notePreview: row.noteText ? row.noteText.slice(0, 280) : null,
    url: `https://www.notion.so/${row.notionPageId.replace(/-/g, '')}`,
    createdByLabel: row.createdByLabel,
    createdByEmail: row.createdByEmail,
  } satisfies TerritoryStoreCheckIn;
}

export function createTerritoryCheckInService(deps: TerritoryCheckInServiceDeps) {
  async function resolveStoreByIdentifier(stores: TerritoryStorePin[], storeId: string) {
    const direct = findStoreById(stores, storeId);
    if (direct) {
      return direct;
    }

    const identity = await resolveAccountIdentity(storeId);
    if (!identity?.notionPageId) {
      return null;
    }

    return findStoreById(stores, identity.notionPageId);
  }

  async function upsertMirroredTerritoryCheckInComment(store: TerritoryStorePin, comment: NotionComment) {
    const noteText = textFromRichTextSegments(comment.rich_text);
    const createdByLabel = commentAuthorLabel(comment, noteText);
    const createdByEmail = extractActorEmailFromCommentText(noteText) ?? comment.created_by?.person?.email?.trim() ?? null;

    return prisma.territoryCheckInMirror.upsert({
      where: { notionCommentId: comment.id },
      update: {
        storeId: store.id,
        notionPageId: store.notionPageId,
        notionDiscussionId: comment.discussion_id ?? null,
        noteText: noteText || null,
        mode: inferCheckInMode(noteText),
        happenedAt: new Date(comment.created_time),
        lastEditedTime: comment.last_edited_time ? new Date(comment.last_edited_time) : null,
        createdByLabel,
        createdByEmail,
        source: 'notion-comment',
        lastSyncedAt: new Date(),
      },
      create: {
        orgId: deps.territoryOrgId(),
        storeId: store.id,
        notionPageId: store.notionPageId,
        notionCommentId: comment.id,
        notionDiscussionId: comment.discussion_id ?? null,
        noteText: noteText || null,
        mode: inferCheckInMode(noteText),
        happenedAt: new Date(comment.created_time),
        lastEditedTime: comment.last_edited_time ? new Date(comment.last_edited_time) : null,
        createdByLabel,
        createdByEmail,
        source: 'notion-comment',
        lastSyncedAt: new Date(),
      },
    });
  }

  async function mirrorKnownTerritoryCheckInComment(
    store: TerritoryStorePin,
    input: {
      notionCommentId: string | null;
      discussionId?: string | null;
      noteText: string;
      createdAt: string;
      actorEmail?: string | null;
    },
  ) {
    if (!input.notionCommentId) {
      return null;
    }

    return prisma.territoryCheckInMirror.upsert({
      where: { notionCommentId: input.notionCommentId },
      update: {
        storeId: store.id,
        notionPageId: store.notionPageId,
        notionDiscussionId: input.discussionId ?? null,
        noteText: input.noteText || null,
        mode: inferCheckInMode(input.noteText),
        happenedAt: new Date(input.createdAt),
        createdByLabel: input.actorEmail?.trim() || null,
        createdByEmail: input.actorEmail?.trim() || null,
        source: 'notion-comment',
        lastSyncedAt: new Date(),
      },
      create: {
        orgId: deps.territoryOrgId(),
        storeId: store.id,
        notionPageId: store.notionPageId,
        notionCommentId: input.notionCommentId,
        notionDiscussionId: input.discussionId ?? null,
        noteText: input.noteText || null,
        mode: inferCheckInMode(input.noteText),
        happenedAt: new Date(input.createdAt),
        createdByLabel: input.actorEmail?.trim() || null,
        createdByEmail: input.actorEmail?.trim() || null,
        source: 'notion-comment',
        lastSyncedAt: new Date(),
      },
    });
  }

  async function syncTerritoryCheckInMirrorForStore(storeId: string, input?: { limit?: number }) {
    const snapshot = await deps.getTerritorySnapshot();
    const store =
      (await deps.loadTerritoryStoreFromReadModel(storeId)) ??
      (await resolveStoreByIdentifier(snapshot.stores, storeId));
    if (!store) {
      throw new Error('Store not found');
    }

    const comments = await listNotionCommentsForPage(deps.notionRequest, store.notionPageId, input?.limit ?? 100);
    const mirrored = await Promise.all(comments.map((comment) => upsertMirroredTerritoryCheckInComment(store, comment)));

    return {
      storeId: store.id,
      mirroredCount: mirrored.length,
      syncedAt: new Date().toISOString(),
    };
  }

  async function syncTerritoryCheckInMirrorByPageId(pageId: string, input?: { limit?: number }) {
    return syncTerritoryCheckInMirrorForStore(pageId, input);
  }

  async function loadStoreCheckIns(store: TerritoryStorePin): Promise<TerritoryStoreCheckIn[]> {
    await syncTerritoryCheckInMirrorForStore(store.id, { limit: 100 }).catch(() => null);

    const [mirrorRows, localRows] = await Promise.all([
      prisma.territoryCheckInMirror.findMany({
        where: { storeId: store.id },
        orderBy: { happenedAt: 'desc' },
        take: 100,
      }).catch(() => []),
      prisma.checkIn.findMany({
        where: {
          storeId: {
            in: [store.id, store.notionPageId],
          },
        },
        orderBy: { happenedAt: 'desc' },
        take: 50,
      }).catch(() => []),
    ]);

    const localCheckIns = localRows.map((row) =>
      mapMirroredCheckInRow({
        notionCommentId: row.id,
        source: 'local-check-in',
        happenedAt: row.happenedAt,
        mode: inferCheckInMode(row.noteText),
        noteText: row.noteText,
        notionPageId: store.notionPageId,
        createdByLabel: row.createdByEmail,
        createdByEmail: row.createdByEmail,
      }),
    );

    const mirroredCheckIns = mirrorRows.map((row) => mapMirroredCheckInRow(row));
    const deduped = new Map<string, TerritoryStoreCheckIn>();

    for (const entry of [...mirroredCheckIns, ...localCheckIns]) {
      if (!deduped.has(entry.id)) {
        deduped.set(entry.id, entry);
      }
    }

    return [...deduped.values()].sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime());
  }

  async function recordTerritoryStoreCheckIn(
    storeId: string,
    input?: {
      contactId?: string | null;
      noteText?: string | null;
      createdByEmail?: string | null;
      persistEvent?: boolean;
    },
  ) {
    const snapshot = await deps.getTerritorySnapshot();
    const store = await resolveStoreByIdentifier(snapshot.stores, storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    const schema = await deps.fetchAndValidateDatabaseSchema();
    const properties = schema.database.properties ?? {};
    const checkInProperty = deps.pickPropertyNameByType(
      properties,
      ['Last Check-in', 'Last Check In', 'Last Visit', 'Recent Check-in'],
      'date',
    );

    if (!checkInProperty) {
      throw new Error('No check-in date property found in Notion database');
    }

    const checkedInAt = new Date().toISOString();

    await deps.notionRequest<unknown>(`/pages/${store.notionPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: {
          [checkInProperty]: {
            date: { start: checkedInAt },
          },
        },
      }),
    });

    await deps.patchStoreInSnapshot(store.id, (entry) => ({
      ...entry,
      lastCheckIn: checkedInAt,
      lastEditedTime: checkedInAt,
    }));
    await deps.patchTerritoryStoreReadModel(store.id, {
      lastCheckIn: checkedInAt,
    });

    if (input?.persistEvent !== false) {
      await deps.recordTerritoryCheckInEvent({
        storeId: store.id,
        contactId: input?.contactId ?? null,
        lat: store.lat,
        lng: store.lng,
        noteText: input?.noteText ?? `Check-in recorded at ${checkedInAt}`,
        createdByEmail: input?.createdByEmail ?? null,
        happenedAt: checkedInAt,
      });
    }

    return {
      storeId: store.id,
      checkedInAt,
    };
  }

  async function createTerritoryStoreCheckInComment(
    storeId: string,
    input?: {
      mode?: 'written' | 'voice';
      noteText?: string | null;
      actorEmail?: string | null;
      followUpDate?: string | null;
      followUpNeeded?: boolean | null;
      followUpReason?: string | null;
      associatedContact?: {
        name: string;
        roleTitle?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;
    },
  ) {
    const snapshot = await deps.getTerritorySnapshot();
    const store = await resolveStoreByIdentifier(snapshot.stores, storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    const mode = input?.mode === 'voice' ? 'Voice' : 'Written';
    const createdAt = new Date().toISOString();
    const parts = [`${mode} check-in`, `Store: ${store.name}`, `When: ${new Date(createdAt).toLocaleString()}`];

    if (input?.actorEmail?.trim()) {
      parts.push(`By: ${input.actorEmail.trim()}`);
    }

    if (input?.associatedContact?.name?.trim()) {
      const contactBits = [
        input.associatedContact.name.trim(),
        input.associatedContact.roleTitle?.trim() || '',
        input.associatedContact.email?.trim() || '',
        input.associatedContact.phone?.trim() || '',
      ].filter(Boolean);
      parts.push(`Contact: ${contactBits.join(' · ')}`);
    }

    if (input?.noteText?.trim()) {
      parts.push('', input.noteText.trim());
    }

    const followUpLines: string[] = [
      input?.followUpDate?.trim() ? `Follow-up Date: ${input.followUpDate.trim()}` : null,
      typeof input?.followUpNeeded === 'boolean' ? `Follow-up Needed: ${input.followUpNeeded ? 'Yes' : 'No'}` : null,
      input?.followUpReason?.trim() ? `Follow-up Reason: ${input.followUpReason.trim()}` : null,
    ].filter((value): value is string => Boolean(value));

    if (followUpLines.length > 0) {
      parts.push('', ...followUpLines);
    }

    const content = parts.join('\n').slice(0, 1800);

    const comment = await deps.notionRequest<{ id?: string; url?: string; discussion_id?: string | null }>(`/comments`, {
      method: 'POST',
      body: JSON.stringify({
        parent: {
          page_id: store.notionPageId,
        },
        ...(input?.actorEmail?.trim()
          ? {
              display_name: {
                type: 'custom',
                custom: {
                  name: input.actorEmail.trim(),
                },
              },
            }
          : {}),
        rich_text: [
          {
            type: 'text',
            text: {
              content,
            },
          },
        ],
      }),
    });

    await mirrorKnownTerritoryCheckInComment(store, {
      notionCommentId: comment.id ?? null,
      discussionId: comment.discussion_id ?? null,
      noteText: content,
      createdAt,
      actorEmail: input?.actorEmail ?? null,
    }).catch(() => null);

    return {
      id: comment.id ?? null,
      url: comment.url ?? `https://www.notion.so/${store.notionPageId.replace(/-/g, '')}`,
      discussionId: comment.discussion_id ?? null,
      createdAt,
      storeId: store.id,
    };
  }

  return {
    createTerritoryStoreCheckInComment,
    loadStoreCheckIns,
    recordTerritoryStoreCheckIn,
    resolveStoreByIdentifier,
    syncTerritoryCheckInMirrorByPageId,
    syncTerritoryCheckInMirrorForStore,
  };
}
