import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Channel } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { MockComposer } from '@/components/conversations/mock-composer';
import { getConversationOverview } from '@/lib/data/queries';

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: 'ALL' | Channel; selected?: string }>;
}) {
  const { orgId } = await requireWorkspaceContext();

  const params = await searchParams;
  const channel = params.channel && params.channel !== 'ALL' ? params.channel : undefined;

  const conversations = await getConversationOverview(orgId, channel as Channel | undefined);
  const selectedId = params.selected ?? conversations[0]?.id;
  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0] ?? null;
  const activeChannel = params.channel ?? 'ALL';
  const inboxHref = `/conversations?channel=${activeChannel}`;

  const counts = {
    ALL: conversations.length,
    EMAIL: conversations.filter((c) => c.channel === 'EMAIL').length,
    SMS: conversations.filter((c) => c.channel === 'SMS').length,
    PHONE_CALL: conversations.filter((c) => c.channel === 'PHONE_CALL').length,
    WHATSAPP: conversations.filter((c) => c.channel === 'WHATSAPP').length,
    OTHER: conversations.filter((c) => c.channel === 'OTHER').length,
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Conversations</h1>
        <p className="text-sm text-slate-500">Mock-mode threaded inbox with account-first visibility and channel separation.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {([
          ['ALL', 'All'],
          ['EMAIL', 'Email'],
          ['SMS', 'SMS'],
          ['PHONE_CALL', 'Phone'],
          ['WHATSAPP', 'WhatsApp'],
          ['OTHER', 'Other'],
        ] as const).map(([value, label]) => {
          const active = activeChannel === value;
          return (
            <Link
              key={value}
              href={`/conversations?channel=${value}`}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {counts[value as keyof typeof counts] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="xl:hidden">
        {params.selected ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{selected ? `${selected.account.name} Thread` : 'Thread'}</span>
                <Link href={inboxHref} className="text-sm text-primary underline underline-offset-2">
                  Back to Inbox
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selected && <p className="text-sm text-slate-500">Select a conversation to open the thread.</p>}
              {selected?.messages.map((message) => (
                <div key={message.id} className="rounded-lg border p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                    <Badge variant="secondary">{message.channel}</Badge>
                    <span>{message.direction}</span>
                    <span>{new Date(message.sentAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm">{message.body}</p>
                </div>
              ))}

              <MockComposer />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Inbox</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {conversations.map((conversation) => {
                const isSelected = selected?.id === conversation.id;
                return (
                  <Link
                    key={conversation.id}
                    href={`/conversations?channel=${activeChannel}&selected=${conversation.id}`}
                    className={`block rounded-lg border p-3 transition hover:bg-slate-50 dark:hover:bg-slate-900 ${isSelected ? 'border-primary/40 bg-primary/5' : ''}`}
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{conversation.account.name}</p>
                      <div className="flex items-center gap-2">
                        {conversation.unreadCount > 0 && <Badge>{conversation.unreadCount}</Badge>}
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{conversation.channel} · {conversation.contact ? `${conversation.contact.firstName} ${conversation.contact.lastName}` : 'No contact'}</p>
                    <p className="truncate text-sm text-slate-600 dark:text-slate-300">{conversation.messages[0]?.body ?? 'No messages yet.'}</p>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="hidden grid-cols-1 gap-4 xl:grid xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Inbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conversations.map((conversation) => {
              const isSelected = selected?.id === conversation.id;
              return (
                <Link
                  key={conversation.id}
                  href={`/conversations?channel=${activeChannel}&selected=${conversation.id}`}
                  className={`block rounded-lg border p-3 transition hover:bg-slate-50 dark:hover:bg-slate-900 ${isSelected ? 'border-primary/40 bg-primary/5' : ''}`}
                  aria-current={isSelected ? 'page' : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{conversation.account.name}</p>
                    <div className="flex items-center gap-2">
                      {conversation.unreadCount > 0 && <Badge>{conversation.unreadCount}</Badge>}
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{conversation.channel} · {conversation.contact ? `${conversation.contact.firstName} ${conversation.contact.lastName}` : 'No contact'}</p>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">{conversation.messages[0]?.body ?? 'No messages yet.'}</p>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{selected ? `${selected.account.name} Thread` : 'Thread'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected && <p className="text-sm text-slate-500">Select a conversation to open the thread.</p>}
            {selected?.messages.map((message) => (
              <div key={message.id} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  <Badge variant="secondary">{message.channel}</Badge>
                  <span>{message.direction}</span>
                  <span>{new Date(message.sentAt).toLocaleString()}</span>
                </div>
                <p className="text-sm">{message.body}</p>
              </div>
            ))}

            <div className="sticky bottom-0">
              <MockComposer />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
