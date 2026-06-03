import 'server-only';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const WORKSPACE_USER_CACHE_TTL_MS = 10 * 60 * 1000;

interface NotionUserListResponse {
  results?: Array<{
    type?: string;
    person?: {
      email?: string;
    };
  }>;
  has_more?: boolean;
  next_cursor?: string | null;
}

let cachedWorkspaceEmails: { expiresAt: number; emails: Set<string> } | null = null;

function requiredEnv(name: 'NOTION_API_KEY') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function notionRequest<T>(path: string) {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${requiredEnv('NOTION_API_KEY')}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Notion users request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

async function loadWorkspaceEmailsFromNotion() {
  const emails = new Set<string>();
  let nextCursor: string | null = null;

  do {
    const cursorParam: string = nextCursor ? `&start_cursor=${encodeURIComponent(nextCursor)}` : '';
    const payload: NotionUserListResponse = await notionRequest<NotionUserListResponse>(`/users?page_size=100${cursorParam}`);

    for (const user of payload.results ?? []) {
      const email = user.type === 'person' ? user.person?.email?.trim().toLowerCase() : '';
      if (email) {
        emails.add(email);
      }
    }

    nextCursor = payload.has_more ? payload.next_cursor ?? null : null;
  } while (nextCursor);

  return emails;
}

export async function getNotionWorkspaceEmails() {
  const now = Date.now();
  if (cachedWorkspaceEmails && cachedWorkspaceEmails.expiresAt > now) {
    return cachedWorkspaceEmails.emails;
  }

  const emails = await loadWorkspaceEmailsFromNotion();
  cachedWorkspaceEmails = {
    emails,
    expiresAt: now + WORKSPACE_USER_CACHE_TTL_MS,
  };
  return emails;
}

export async function hasNotionWorkspaceUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const emails = await getNotionWorkspaceEmails();
  return emails.has(normalizedEmail);
}
