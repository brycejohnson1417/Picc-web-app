import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enqueueTerritoryStoreSync, syncTerritoryCheckInMirrorByPageId } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

type NotionWebhookPayload = {
  type?: string;
  verification_token?: string;
  entity?: {
    id?: string;
    type?: string;
  } | null;
  data?: {
    id?: string;
    page_id?: string;
    parent?: {
      page_id?: string;
      block_id?: string;
    } | null;
  } | null;
};

function webhookSecret() {
  return (
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim() ||
    process.env.NOTION_WEBHOOK_SECRET?.trim() ||
    ''
  );
}

function isProductionWebhookRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function verifyWebhookRequest(rawBody: string, headers: Headers) {
  const secret = webhookSecret();

  if (!secret) {
    if (isProductionWebhookRuntime()) {
      return NextResponse.json({ error: 'Notion webhook secret is not configured' }, { status: 401 });
    }

    return null;
  }

  const signature = headers.get('x-notion-signature')?.trim();
  if (!signature) {
    return NextResponse.json({ error: 'Missing Notion webhook signature header' }, { status: 401 });
  }

  if (!isValidNotionSignature(rawBody, secret, signature)) {
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 401 });
  }

  return null;
}

function isValidNotionSignature(rawBody: string, secret: string, signature: string) {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function resolvePageId(payload: NotionWebhookPayload) {
  const explicitPageId = payload.data?.page_id?.trim();
  if (explicitPageId) {
    return explicitPageId;
  }

  const parentPageId = payload.data?.parent?.page_id?.trim();
  if (parentPageId) {
    return parentPageId;
  }

  if (payload.entity?.type === 'page' && payload.entity.id?.trim()) {
    return payload.entity.id.trim();
  }

  return null;
}

function isCommentEvent(type: string | undefined) {
  return type === 'comment.created' || type === 'comment.updated';
}

function isPageEvent(type: string | undefined) {
  return typeof type === 'string' && type.startsWith('page.');
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let parsedPayload: NotionWebhookPayload;

  try {
    parsedPayload = rawBody ? (JSON.parse(rawBody) as NotionWebhookPayload) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (parsedPayload.verification_token) {
    console.info('Notion webhook verification token received. Store it securely if your integration requires signed delivery.', {
      hasVerificationToken: true,
    });
    return NextResponse.json({ ok: true });
  }

  const verificationError = verifyWebhookRequest(rawBody, request.headers);
  if (verificationError) {
    return verificationError;
  }

  if (!isCommentEvent(parsedPayload.type) && !isPageEvent(parsedPayload.type)) {
    return NextResponse.json({ ok: true, ignored: parsedPayload.type ?? 'unknown' });
  }

  const pageId = resolvePageId(parsedPayload);
  if (!pageId) {
    return NextResponse.json({ ok: true, ignored: 'missing-page-id' });
  }

  if (isPageEvent(parsedPayload.type)) {
    const queueResult = await enqueueTerritoryStoreSync(pageId, {
      reason: parsedPayload.type,
    }).catch((error) => ({
      error: error instanceof Error ? error.message : 'Failed to queue territory page sync',
    }));

    if (queueResult && typeof queueResult === 'object' && 'error' in queueResult) {
      console.error('Notion webhook page queue failed', {
        type: parsedPayload.type,
        pageId,
        error: queueResult.error,
      });
    }

    return NextResponse.json({
      ok: true,
      type: parsedPayload.type,
      queuedPageId: pageId,
      queued: !(queueResult && typeof queueResult === 'object' && 'error' in queueResult),
    });
  }

  const result = await syncTerritoryCheckInMirrorByPageId(pageId, {
    limit: 100,
  }).catch((error) => ({
    error: error instanceof Error ? error.message : 'Failed to sync territory comment mirror',
  }));

  if ('error' in result) {
    console.error('Notion webhook comment sync failed', {
      type: parsedPayload.type,
      pageId,
      error: result.error,
    });
    return NextResponse.json({
      ok: true,
      type: parsedPayload.type,
      syncedPageId: pageId,
      synced: false,
      error: result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    type: parsedPayload.type,
    ...result,
  });
}
