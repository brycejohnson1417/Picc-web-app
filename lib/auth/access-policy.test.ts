import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/guest-invites', () => ({
  getActiveGuestInviteByEmail: vi.fn(),
}));

vi.mock('@/lib/server/notion-workspace-users', () => ({
  hasNotionWorkspaceUser: vi.fn(),
}));

import { getActiveGuestInviteByEmail } from '@/lib/auth/guest-invites';
import { evaluateUserAccess, isRequiredCompanyEmail } from '@/lib/auth/access-policy';
import { hasNotionWorkspaceUser } from '@/lib/server/notion-workspace-users';

const mockedGetActiveGuestInviteByEmail = vi.mocked(getActiveGuestInviteByEmail);
const mockedHasNotionWorkspaceUser = vi.mocked(hasNotionWorkspaceUser);

describe('access policy', () => {
  beforeEach(() => {
    delete process.env.TERRITORY_ALLOWED_EMAILS;
    mockedGetActiveGuestInviteByEmail.mockReset();
    mockedHasNotionWorkspaceUser.mockReset();
  });

  it('recognizes company emails', () => {
    expect(isRequiredCompanyEmail('owner@piccplatform.com')).toBe(true);
    expect(isRequiredCompanyEmail('viewer@gmail.com')).toBe(false);
  });

  it('rejects missing email addresses', async () => {
    await expect(evaluateUserAccess('')).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('allows an active guest invite before company-email checks', async () => {
    mockedGetActiveGuestInviteByEmail.mockResolvedValue({
      id: 'invite_1',
      orgId: 'org_guest',
    } as Awaited<ReturnType<typeof getActiveGuestInviteByEmail>>);

    await expect(evaluateUserAccess('viewer@gmail.com')).resolves.toMatchObject({
      ok: true,
      accessType: 'guest',
      workspaceOrgId: 'org_guest',
      email: 'viewer@gmail.com',
    });
  });

  it('rejects non-company emails without a guest invite', async () => {
    mockedGetActiveGuestInviteByEmail.mockResolvedValue(null);

    await expect(evaluateUserAccess('viewer@gmail.com')).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('rejects company emails that are not allowlisted', async () => {
    process.env.TERRITORY_ALLOWED_EMAILS = 'owner@piccplatform.com';
    mockedGetActiveGuestInviteByEmail.mockResolvedValue(null);

    await expect(evaluateUserAccess('rep@piccplatform.com')).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('rejects allowlisted company emails that are missing from the notion workspace', async () => {
    process.env.TERRITORY_ALLOWED_EMAILS = '*';
    mockedGetActiveGuestInviteByEmail.mockResolvedValue(null);
    mockedHasNotionWorkspaceUser.mockResolvedValue(false);

    await expect(evaluateUserAccess('rep@piccplatform.com')).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('allows allowlisted company emails that also exist in notion', async () => {
    process.env.TERRITORY_ALLOWED_EMAILS = '*';
    mockedGetActiveGuestInviteByEmail.mockResolvedValue(null);
    mockedHasNotionWorkspaceUser.mockResolvedValue(true);

    await expect(evaluateUserAccess('rep@piccplatform.com')).resolves.toMatchObject({
      ok: true,
      status: 200,
      accessType: 'workspace',
      email: 'rep@piccplatform.com',
    });
  });
});
