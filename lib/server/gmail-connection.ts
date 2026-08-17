import { IntegrationSyncStatus } from '@prisma/client';
import { protectToken, revealToken } from '@/lib/gmail/gmail-domain';
import { prisma } from '@/lib/db/prisma';
import { refreshGmailAccessToken, type GmailTokenResponse } from '@/lib/server/gmail-provider';

export class GmailNotConnectedError extends Error {
  constructor() {
    super('Connect Gmail in Settings to load mailbox activity.');
  }
}

export const GMAIL_SETUP_UNAVAILABLE_MESSAGE = 'Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.';

export class GmailIntegrationUnavailableError extends Error {
  constructor() {
    super(GMAIL_SETUP_UNAVAILABLE_MESSAGE);
    this.name = 'GmailIntegrationUnavailableError';
  }
}

function isMissingTableError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2021';
}

async function withGmailConnectionTable<T>(query: () => Promise<T>) {
  try {
    return await query();
  } catch (error) {
    if (isMissingTableError(error)) throw new GmailIntegrationUnavailableError();
    throw error;
  }
}

export function getGmailConnectionStatus(orgId: string, clerkUserId: string) {
  return withGmailConnectionTable(() => prisma.gmailConnection.findUnique({
    where: { orgId_clerkUserId: { orgId, clerkUserId } },
    select: { mailboxEmail: true, status: true, lastSyncedAt: true, lastError: true, updatedAt: true },
  }));
}

export function tokenExpiry(tokens: Pick<GmailTokenResponse, 'expires_in'>) {
  return new Date(Date.now() + Math.max(tokens.expires_in - 60, 60) * 1000);
}

export async function getGmailAccess(orgId: string, clerkUserId: string) {
  const connection = await withGmailConnectionTable(() => prisma.gmailConnection.findUnique({
    where: { orgId_clerkUserId: { orgId, clerkUserId } },
  }));
  if (!connection || !connection.encryptedRefreshToken) throw new GmailNotConnectedError();

  if (connection.encryptedAccessToken && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt > new Date()) {
    return { accessToken: revealToken(connection.encryptedAccessToken), connection };
  }

  try {
    const refreshed = await refreshGmailAccessToken(revealToken(connection.encryptedRefreshToken));
    const updated = await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: {
        encryptedAccessToken: protectToken(refreshed.access_token),
        accessTokenExpiresAt: tokenExpiry(refreshed),
        grantedScope: refreshed.scope || connection.grantedScope,
        status: IntegrationSyncStatus.SUCCESS,
        lastError: null,
      },
    });
    return { accessToken: refreshed.access_token, connection: updated };
  } catch (error) {
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: { status: IntegrationSyncStatus.ERROR, lastError: error instanceof Error ? error.message.slice(0, 500) : 'Token refresh failed' },
    }).catch(() => undefined);
    throw error;
  }
}
