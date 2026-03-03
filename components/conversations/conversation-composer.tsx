'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea } from '@/components/ui';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ConversationComposerProps {
  conversationId: string | null;
  className?: string;
}

export function ConversationComposer({ conversationId, className }: ConversationComposerProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const canSend = Boolean(conversationId && message.trim()) && !isSubmitting;

  async function sendMessage() {
    if (!conversationId) {
      toast.error('Select a conversation to send a message.');
      return;
    }

    if (!message.trim()) {
      toast.error('Message body is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, body: message.trim(), subject: subject.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to send message.');
      }
      setMessage('');
      setSubject('');
      toast.success('Message sent (mock)');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn('space-y-2 rounded-xl border bg-white p-3 dark:bg-slate-950', className)}>
      <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject (optional)" />
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Compose message..."
      />
      <div className="flex justify-end">
        <Button className="min-h-11" onClick={sendMessage} disabled={!canSend}>
          {isSubmitting ? 'Sending...' : 'Send (mock)'}
        </Button>
      </div>
    </div>
  );
}
