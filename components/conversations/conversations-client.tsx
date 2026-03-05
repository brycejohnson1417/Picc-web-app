'use client';

import { ChevronRight, Loader2, MessageCirclePlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Badge, Button, Input, Textarea } from '@/components/ui';

type ConversationMessage = {
  id: string;
  channel: Channel;
  direction: 'INBOUND' | 'OUTBOUND';
  sentAt: string;
  body: string;
};

type Channel = 'EMAIL' | 'SMS' | 'PHONE_CALL' | 'WHATSAPP' | 'OTHER';

type ConversationItem = {
  id: string;
  channel: Channel;
  subject: string | null;
  unreadCount: number;
  account: { id: string; name: string };
  contact: { id: string; firstName: string; lastName: string } | null;
  messages: ConversationMessage[];
  updatedAt: string;
};

type AccountOption = {
  id: string;
  name: string;
};

const channelTabs: Array<{ value: 'ALL' | Channel; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'PHONE_CALL', label: 'Phone' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'OTHER', label: 'Other' },
];

export function ConversationsClient() {
  const searchParams = useSearchParams();
  const [activeChannel, setActiveChannel] = useState<'ALL' | Channel>('ALL');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState('');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAccountId, setNewAccountId] = useState('');
  const [newChannel, setNewChannel] = useState<Channel>('EMAIL');
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');

  const loadAccounts = useCallback(async () => {
    const response = await fetch('/api/accounts', { cache: 'no-store' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error ?? 'Failed to load accounts');
    }
    const payload = (await response.json()) as Array<{ id: string; name: string }>;
    setAccounts(payload.map((item) => ({ id: item.id, name: item.name })));
    if (!newAccountId && payload[0]?.id) {
      setNewAccountId(payload[0].id);
    }
  }, [newAccountId]);

  const loadConversations = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const params = new URLSearchParams();
        if (activeChannel !== 'ALL') {
          params.set('channel', activeChannel);
        }
        const response = await fetch(`/api/conversations?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Failed to load conversations');
        }
        const payload = (await response.json()) as ConversationItem[];
        setConversations(payload);
        if (payload.length === 0) {
          setSelectedId(null);
        } else if (!selectedId || !payload.some((item) => item.id === selectedId)) {
          setSelectedId(payload[0].id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load conversations');
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [activeChannel, selectedId],
  );

  useEffect(() => {
    void Promise.all([loadConversations(), loadAccounts()]);
  }, [loadConversations, loadAccounts]);

  useEffect(() => {
    const accountId = searchParams.get('accountId');
    if (!accountId) return;
    setCreateOpen(true);
    setNewAccountId(accountId);
  }, [searchParams]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const counts = useMemo(() => {
    return {
      ALL: conversations.length,
      EMAIL: conversations.filter((item) => item.channel === 'EMAIL').length,
      SMS: conversations.filter((item) => item.channel === 'SMS').length,
      PHONE_CALL: conversations.filter((item) => item.channel === 'PHONE_CALL').length,
      WHATSAPP: conversations.filter((item) => item.channel === 'WHATSAPP').length,
      OTHER: conversations.filter((item) => item.channel === 'OTHER').length,
    };
  }, [conversations]);

  async function markConversationRead(conversationId: string) {
    setConversations((current) =>
      current.map((item) => (item.id === conversationId ? { ...item, unreadCount: 0 } : item)),
    );

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markRead: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to mark conversation read');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to mark conversation read');
      await loadConversations({ silent: true });
    }
  }

  function handleSelectConversation(conversation: ConversationItem) {
    setSelectedId(conversation.id);
    if (conversation.unreadCount > 0) {
      void markConversationRead(conversation.id);
    }
  }

  async function handleSendMessage() {
    if (!selectedConversation) {
      toast.error('Select a conversation first');
      return;
    }
    if (!body.trim()) {
      toast.error('Message body is required');
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          body: body.trim(),
          direction: 'OUTBOUND',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to send message');
      }

      setBody('');
      await loadConversations({ silent: true });
      toast.success('Message sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleCreateConversation() {
    if (!newAccountId) {
      toast.error('Select an account');
      return;
    }

    setCreating(true);
    try {
      const createResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: newAccountId,
          channel: newChannel,
          subject: newSubject.trim() || null,
        }),
      });
      const createPayload = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) {
        throw new Error(createPayload?.error ?? 'Failed to create conversation');
      }

      const createdConversationId = typeof createPayload?.id === 'string' ? createPayload.id : null;

      if (createdConversationId && newMessage.trim()) {
        const messageResponse = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: createdConversationId,
            body: newMessage.trim(),
            direction: 'OUTBOUND',
          }),
        });
        const messagePayload = await messageResponse.json().catch(() => ({}));
        if (!messageResponse.ok) {
          throw new Error(messagePayload?.error ?? 'Conversation created but first message failed');
        }
      }

      setCreateOpen(false);
      setNewSubject('');
      setNewMessage('');
      await loadConversations({ silent: true });
      if (createdConversationId) {
        setSelectedId(createdConversationId);
      }
      toast.success('Conversation created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create conversation');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Conversations</h1>
          <p className="text-sm text-slate-500">Account-linked inbox with live conversation and messaging mutations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => loadConversations({ silent: true })} disabled={refreshing || loading}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={() => setCreateOpen((value) => !value)}>
            <MessageCirclePlus className="mr-1 h-4 w-4" />
            {createOpen ? 'Close' : 'New Conversation'}
          </Button>
        </div>
      </header>

      {createOpen ? (
        <div className="rounded-xl border bg-white p-4 dark:bg-slate-950">
          <h2 className="text-sm font-semibold">Create Conversation</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-500">
              Account
              <select
                value={newAccountId}
                onChange={(event) => setNewAccountId(event.target.value)}
                className="h-11 w-full rounded-md border bg-white px-3 text-sm text-slate-900"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-500">
              Channel
              <select
                value={newChannel}
                onChange={(event) => setNewChannel(event.target.value as Channel)}
                className="h-11 w-full rounded-md border bg-white px-3 text-sm text-slate-900"
              >
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
                <option value="PHONE_CALL">Phone</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
              Subject (optional)
              <Input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="Intro follow-up" />
            </label>

            <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
              First Message (optional)
              <Textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} placeholder="Type the first message..." />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateConversation} disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {channelTabs.map((tab) => {
          const active = activeChannel === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveChannel(tab.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {counts[tab.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border p-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-xl border bg-white p-3 dark:bg-slate-950">
            <h2 className="mb-2 text-sm font-semibold">Inbox</h2>
            <div className="space-y-2">
              {conversations.length === 0 ? <p className="text-sm text-slate-500">No conversations found.</p> : null}
              {conversations.map((conversation) => {
                const isSelected = selectedConversation?.id === conversation.id;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation)}
                    className={`w-full rounded-lg border p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900 ${isSelected ? 'border-primary/40 bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{conversation.account.name}</p>
                      <div className="flex items-center gap-2">
                        {conversation.unreadCount > 0 ? <Badge>{conversation.unreadCount}</Badge> : null}
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {conversation.channel}
                      {conversation.contact ? ` · ${conversation.contact.firstName} ${conversation.contact.lastName}` : ''}
                    </p>
                    <p className="truncate text-sm text-slate-600 dark:text-slate-300">{conversation.messages[0]?.body ?? 'No messages yet.'}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-3 xl:col-span-2 dark:bg-slate-950">
            <h2 className="mb-2 text-sm font-semibold">{selectedConversation ? `${selectedConversation.account.name} Thread` : 'Thread'}</h2>
            {!selectedConversation ? <p className="text-sm text-slate-500">Select a conversation to open the thread.</p> : null}

            <div className="max-h-[420px] space-y-3 overflow-y-auto pb-2">
              {selectedConversation?.messages
                .slice()
                .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
                .map((message) => (
                  <div key={message.id} className="rounded-lg border p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                      <Badge variant="secondary">{message.channel}</Badge>
                      <span>{message.direction}</span>
                      <span>{new Date(message.sentAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm">{message.body}</p>
                  </div>
                ))}
            </div>

            {selectedConversation ? (
              <div className="mt-3 space-y-2 border-t pt-3">
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Compose message..."
                  disabled={sending}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setBody('')} disabled={sending || !body.trim()}>
                    Clear
                  </Button>
                  <Button onClick={handleSendMessage} disabled={sending || !body.trim()}>
                    {sending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
