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

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

type NotionTextSegment = { plain_text?: string };

type NotionRow = {
  id: string;
  properties: Record<string, {
    type?: string;
    title?: NotionTextSegment[];
    rich_text?: NotionTextSegment[];
    select?: { name?: string } | null;
    status?: { name?: string } | null;
    checkbox?: boolean;
  }>;
};

type NotionQueryResponse = {
  results?: NotionRow[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function normalizePropertyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function textFromProperty(value: NotionRow['properties'][string] | undefined) {
  const title = Array.isArray(value?.title) ? value.title.map((item) => item?.plain_text ?? '').join('') : '';
  if (title.trim()) return title.trim();

  const richText = Array.isArray(value?.rich_text) ? value.rich_text.map((item) => item?.plain_text ?? '').join('') : '';
  if (richText.trim()) return richText.trim();

  if (value?.select?.name) return value.select.name;
  if (value?.status?.name) return value.status.name;

  return '';
}

function readField(properties: NotionRow['properties'], candidates: string[]) {
  const candidateSet = new Set(candidates.map(normalizePropertyName));
  for (const [name, property] of Object.entries(properties)) {
    if (candidateSet.has(normalizePropertyName(name))) {
      return textFromProperty(property);
    }
  }
  return '';
}

function readCheckboxField(properties: NotionRow['properties'], candidates: string[]) {
  const candidateSet = new Set(candidates.map(normalizePropertyName));
  for (const [name, property] of Object.entries(properties)) {
    if (candidateSet.has(normalizePropertyName(name)) && typeof property?.checkbox === 'boolean') {
      return property.checkbox;
    }
  }
  return true;
}

function parseRole(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  return roleMap[normalized] ?? null;
}

async function notionRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.NOTION_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('NOTION_API_KEY is required');
  }

  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Notion request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

async function loadTeamDirectoryRows() {
  const databaseId = process.env.NOTION_TEAM_DIRECTORY_DATABASE_ID?.trim();
  if (!databaseId) {
    throw new Error('NOTION_TEAM_DIRECTORY_DATABASE_ID is required');
  }

  const rows: NotionRow[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const page: NotionQueryResponse = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });

    rows.push(...(page.results ?? []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return rows;
}

export async function POST() {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const notionRows = await loadTeamDirectoryRows();

    const parsed = notionRows
      .map((row) => {
        const clerkUserId = readField(row.properties, ['Clerk User ID', 'Clerk ID', 'User ID', 'clerkUserId']);
        const roleRaw = readField(row.properties, ['Role', 'PICC Role', 'Access Role']);
        const active = readCheckboxField(row.properties, ['Active', 'Enabled']);
        const role = parseRole(roleRaw);

        return {
          clerkUserId,
          role,
          active,
        };
      })
      .filter((row): row is { clerkUserId: string; role: Role; active: boolean } => Boolean(row.clerkUserId && row.role));

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: 'No valid team directory rows found in Notion. Ensure Clerk User ID and Role properties are populated.' },
        { status: 400 },
      );
    }

    for (const row of parsed) {
      await prisma.membership.upsert({
        where: {
          orgId_clerkUserId: {
            orgId: ctx.orgId,
            clerkUserId: row.clerkUserId,
          },
        },
        update: {
          role: row.role,
          source: 'NOTION_SYNC',
          active: row.active,
        },
        create: {
          orgId: ctx.orgId,
          clerkUserId: row.clerkUserId,
          role: row.role,
          source: 'NOTION_SYNC',
          active: row.active,
        },
      });
    }

    return NextResponse.json({ synced: parsed.length });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync team directory',
      },
      { status: 500 },
    );
  }
}
