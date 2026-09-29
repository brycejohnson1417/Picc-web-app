import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  account: vi.fn(), contact: vi.fn(), opportunity: vi.fn(), pipeline: vi.fn(), stage: vi.fn(),
  create: vi.fn(), activity: vi.fn(), notion: vi.fn(), territory: vi.fn(),
}));
vi.mock('@/lib/auth/api-guard', () => ({ guard: vi.fn(async () => ({ orgId: 'org-a', userId: 'user-a' })) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  account: { findFirst: mocks.account }, contact: { findFirst: mocks.contact },
  opportunity: { findFirst: mocks.opportunity, create: mocks.create }, pipeline: { findFirst: mocks.pipeline },
  stage: { findFirst: mocks.stage }, task: { create: mocks.create }, appointment: { create: mocks.create },
  territoryStoreReadModel: { findFirst: mocks.territory },
} }));
vi.mock('@/lib/activity-log/write', () => ({ writeActivity: mocks.activity }));
vi.mock('@/lib/server/contact-creation', () => ({ createVerifiedContact: mocks.notion }));
vi.mock('@/lib/server/notion-contact-creation', () => ({ createNotionContactCreationAdapter: () => ({}) }));
const accountId = 'caaaaaaaaaaaaaaaaaaaaaaaa';
const contactId = 'cbbbbbbbbbbbbbbbbbbbbbbbb';
const opportunityId = 'ccccccccccccccccccccccccc';
const pipelineId = 'cdddddddddddddddddddddddd';
const stageId = 'ceeeeeeeeeeeeeeeeeeeeeeee';
const body = { accountId, contactId, opportunityId, pipelineId, stageId, title: 'Call buyer', name: 'New sale', value: 100, startsAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-01T11:00:00Z' };
const routes = {
  tasks: () => import('@/app/api/tasks/route'),
  appointments: () => import('@/app/api/appointments/route'),
  opportunities: () => import('@/app/api/opportunities/route'),
};
function request(payload: unknown) { return new Request('https://example.com/api/test', { method: 'POST', body: JSON.stringify(payload) }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue({ id: accountId });
  mocks.contact.mockResolvedValue({ id: contactId, accountId });
  mocks.opportunity.mockResolvedValue({ id: opportunityId, accountId, contactId });
  mocks.pipeline.mockResolvedValue({ id: pipelineId });
  mocks.stage.mockResolvedValue({ id: stageId, pipelineId });
  mocks.create.mockResolvedValue({ id: 'created' });
  mocks.territory.mockResolvedValue({ id: 'store' });
  mocks.notion.mockResolvedValue({ status: 'created_verified' });
});

describe.each(Object.keys(routes) as Array<keyof typeof routes>)('%s relationship boundary', (route) => {
  it('accepts compatible records scoped to the authenticated org', async () => {
    const { POST } = await routes[route]();
    const response = await POST(request(body));
    expect(response?.status).toBe(201);
    expect(mocks.account).toHaveBeenCalledWith(expect.objectContaining({ where: { id: accountId, orgId: 'org-a' } }));
    expect(mocks.contact).toHaveBeenCalledWith(expect.objectContaining({ where: { id: contactId, orgId: 'org-a' } }));
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it.each(['account', 'contact'] as const)('rejects a missing or foreign %s before any write', async (kind) => {
    mocks[kind].mockResolvedValue(null);
    const { POST } = await routes[route]();
    const response = await POST(request(body));
    expect(response?.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
  });
  it('rejects a contact from another account', async () => {
    mocks.contact.mockResolvedValue({ id: contactId, accountId: 'other-account' });
    const { POST } = await routes[route]();
    const response = await POST(request(body));
    expect(response?.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
  });
});

it.each(['tasks', 'appointments'] as const)('rejects a mismatched opportunity in %s', async (route) => {
  mocks.opportunity.mockResolvedValue({ id: opportunityId, accountId, contactId: 'other-contact' });
  const { POST } = await routes[route]();
  expect((await POST(request(body)))?.status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(['pipeline', 'stage'] as const)('rejects missing/foreign %s in opportunities', async (kind) => {
  mocks[kind].mockResolvedValue(null);
  const { POST } = await routes.opportunities();
  expect((await POST(request(body)))?.status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('rejects a stage from a different pipeline', async () => {
  mocks.stage.mockResolvedValue({ id: stageId, pipelineId: 'other-pipeline' });
  const { POST } = await routes.opportunities();
  expect((await POST(request(body)))?.status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('rejects a Notion contact account absent from the authenticated workspace before external writes', async () => {
  mocks.territory.mockResolvedValue(null);
  const { POST } = await import('@/app/api/contacts/route');
  const response = await POST(request({ accountPageId: '11111111-1111-4111-8111-111111111111', name: 'Buyer', position: 'Buyer', email: null, phone: null }));
  expect(response?.status).toBe(404);
  expect(mocks.notion).not.toHaveBeenCalled();
});

it.each(['tasks', 'appointments'] as const)('rejects unavailable opportunities in %s', async (route) => {
  mocks.opportunity.mockResolvedValue(null);
  const { POST } = await routes[route]();
  expect((await POST(request(body)))?.status).toBe(404);
  expect(mocks.opportunity).toHaveBeenCalledWith(expect.objectContaining({ where: { id: opportunityId, orgId: 'org-a' } }));
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.activity).not.toHaveBeenCalled();
});
it.each(['tasks', 'appointments'] as const)('rejects another account opportunity in %s', async (route) => {
  mocks.opportunity.mockResolvedValue({ accountId: 'other-account', contactId });
  const { POST } = await routes[route]();
  expect((await POST(request(body)))?.status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(['tasks', 'appointments'] as const)('allows omitted optional relationships in %s', async (route) => {
  const { POST } = await routes[route]();
  expect((await POST(request({ ...body, contactId: null, opportunityId: null })))?.status).toBe(201);
  expect(mocks.contact).not.toHaveBeenCalled();
  expect(mocks.opportunity).not.toHaveBeenCalled();
});
it('scopes Notion account checks to the request org and accepts UUID formatting', async () => {
  const { POST } = await import('@/app/api/contacts/route');
  expect((await POST(request({ accountPageId: '11111111-1111-4111-8111-111111111111', name: 'Buyer', position: 'Buyer', email: null, phone: null })))?.status).toBe(201);
  expect(mocks.territory).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 'org-a', notionPageId: { in: expect.arrayContaining(['11111111111141118111111111111111', '11111111-1111-4111-8111-111111111111']) } } }));
});
