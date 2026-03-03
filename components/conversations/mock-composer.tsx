'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Input, Textarea } from '@/components/ui';

export function MockComposer() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setStatus(null);

    if (!body.trim()) {
      setError('Add a message before sending.');
      return;
    }

    setSending(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setBody('');
      setSubject('');
      setStatus('Message queued (mock mode).');
    } catch {
      setError('Unable to send right now. Try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border bg-white p-3 dark:bg-slate-950">
      <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject (optional)" disabled={sending} />
      <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Compose message... (mock mode)" disabled={sending} />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {status ? <p className="text-xs text-emerald-600">{status}</p> : null}
      <div className="flex justify-end">
        <Button className="min-h-11" onClick={handleSend} disabled={sending || !body.trim()}>
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            'Send (mock)'
          )}
        </Button>
      </div>
    </div>
  );
}
