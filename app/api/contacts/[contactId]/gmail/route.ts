import { gmailConversations } from '@/lib/server/gmail-conversations';

export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  return gmailConversations(request, { kind: 'contact', id: contactId });
}

// Old clients may still request a refresh with POST. It is now read-through and never moves activity records.
export const POST = GET;
