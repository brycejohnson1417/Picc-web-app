import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const accountPageId = '11111111-1111-4111-8111-111111111111';
const contactPageId = '22222222-2222-4222-8222-222222222222';

const verified = {
  status: 'created_verified' as const,
  accountPageId,
  contact: {
    id: contactPageId,
    name: 'Maya Chen',
    position: 'Buyer',
    email: 'maya@example.com',
    phone: null,
  },
};

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function mockDependencies(input?: {
  guardResult?: unknown;
  createResult?: unknown;
  retryResult?: unknown;
}) {
  vi.doMock('@/lib/db/prisma', () => ({ prisma: { territoryStoreReadModel: { findFirst: vi.fn().mockResolvedValue({ id: 'store' }) } } }));
  vi.doMock('@/lib/auth/api-guard', () => ({
    guard: vi.fn().mockResolvedValue(input?.guardResult ?? { orgId: 'org', userId: 'user' }),
  }));
  vi.doMock('@/lib/server/notion-contact-creation', () => ({
    createNotionContactCreationAdapter: vi.fn(() => ({ boundary: 'notion' })),
  }));
  vi.doMock('@/lib/server/contact-creation', () => ({
    createVerifiedContact: vi.fn().mockResolvedValue(input?.createResult ?? verified),
    retryVerifiedContactLink: vi.fn().mockResolvedValue(
      input?.retryResult ?? { ...verified, status: 'existing_verified' },
    ),
  }));
}

describe('contact write routes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and verifies a Notion contact for an authorized user', async () => {
    await mockDependencies();
    const { POST } = await import('@/app/api/contacts/route');

    const response = (await POST(
      request('/api/contacts', {
        accountPageId,
        name: 'Maya Chen',
        position: 'Buyer',
        email: 'maya@example.com',
        phone: null,
      }),
    )) as Response;

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(verified);
  });

  it('returns accepted with retry context when only one relation side is confirmed', async () => {
    const partial = {
      ...verified,
      status: 'partial_relation' as const,
      retry: { accountPageId, contactPageId },
    };
    await mockDependencies({ createResult: partial });
    const { POST } = await import('@/app/api/contacts/route');

    const response = (await POST(
      request('/api/contacts', {
        accountPageId,
        name: 'Maya Chen',
        position: 'Buyer',
        email: null,
        phone: null,
      }),
    )) as Response;

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(partial);
  });

  it('returns conflict details without creating when a requested CRM role is occupied', async () => {
    const collision = {
      status: 'role_collision' as const,
      accountPageId,
      contact: null,
      collisions: [{ role: 'PRIMARY_CONTACT', label: 'Primary Contact', existingContacts: [{ id: 'existing', name: 'Existing Buyer' }] }],
    };
    await mockDependencies({ createResult: collision });
    const { POST } = await import('@/app/api/contacts/route');

    const response = (await POST(request('/api/contacts', {
      accountPageId,
      name: 'Maya Chen',
      position: 'Buyer',
      email: null,
      phone: null,
      roles: ['PRIMARY_CONTACT'],
      overwriteRoles: false,
    }))) as Response;

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(collision);
  });

  it('rejects malformed contact payloads before calling the external boundary', async () => {
    await mockDependencies();
    const domain = await import('@/lib/server/contact-creation');
    const { POST } = await import('@/app/api/contacts/route');

    const response = (await POST(request('/api/contacts', { accountPageId, name: '' }))) as Response;

    expect(response.status).toBe(400);
    expect(vi.mocked(domain.createVerifiedContact)).not.toHaveBeenCalled();
  });

  it('returns the auth guard response without attempting creation', async () => {
    await mockDependencies({
      guardResult: { error: Response.json({ error: 'Forbidden' }, { status: 403 }) },
    });
    const domain = await import('@/lib/server/contact-creation');
    const { POST } = await import('@/app/api/contacts/route');

    const response = (await POST(request('/api/contacts', {}))) as Response;

    expect(response.status).toBe(403);
    expect(vi.mocked(domain.createVerifiedContact)).not.toHaveBeenCalled();
  });

  it('retries a partial relationship without creating another contact', async () => {
    await mockDependencies();
    const domain = await import('@/lib/server/contact-creation');
    const { POST } = await import('@/app/api/contacts/retry/route');

    const response = (await POST(
      request('/api/contacts/retry', { accountPageId, contactPageId, roles: ['PRIMARY_CONTACT'] }),
    )) as Response;

    expect(response.status).toBe(200);
    expect(vi.mocked(domain.retryVerifiedContactLink)).toHaveBeenCalledWith(
      { accountPageId, contactPageId, roles: ['PRIMARY_CONTACT'] },
      { boundary: 'notion' },
    );
  });
});
