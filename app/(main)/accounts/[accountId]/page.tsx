import { notFound, redirect } from 'next/navigation';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { resolveAccountIdentity } from '@/lib/server/account-identity';

export default async function AccountDetailRedirectPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { orgId } = await requireWorkspaceContext();
  const { accountId } = await params;
  const resolved = await resolveAccountIdentity(accountId, orgId);

  if (!resolved?.notionPageId) {
    notFound();
  }

  redirect(`/accounts?storeId=${encodeURIComponent(resolved.notionPageId)}`);
}
