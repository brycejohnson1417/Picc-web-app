import { gmailConversations } from '@/lib/server/gmail-conversations';

export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return gmailConversations(request, { kind: 'account', id: accountId });
}
