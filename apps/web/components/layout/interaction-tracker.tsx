'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type InteractionAction = 'interaction.click' | 'interaction.keydown' | 'navigation.view';

type InteractionEventPayload = {
  action: InteractionAction;
  happenedAt: string;
  path: string;
  label: string;
  detail?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

const MAX_BATCH_SIZE = 24;
const MAX_QUEUE_SIZE = 200;
const FLUSH_INTERVAL_MS = 10_000;

function sanitizeText(value: string | null | undefined, maxLength = 80) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function isEditableElement(target: Element | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(target.type);
}

function resolveInteractionTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('button, a, input, textarea, select, summary, label, [role="button"], [data-track-interaction]');
  if (!element) return null;

  const label =
    sanitizeText(element.getAttribute('aria-label')) ||
    sanitizeText(element.getAttribute('title')) ||
    sanitizeText(element.textContent) ||
    sanitizeText(element.getAttribute('name')) ||
    sanitizeText(element.id);

  return {
    element,
    targetTag: element.tagName.toLowerCase(),
    targetRole: sanitizeText(element.getAttribute('role')),
    targetType: element instanceof HTMLInputElement ? sanitizeText(element.type) : null,
    targetHref: element instanceof HTMLAnchorElement ? sanitizeText(element.getAttribute('href'), 140) : null,
    targetLabel: label,
    entityId: sanitizeText(element.id) || sanitizeText(element.getAttribute('name')) || sanitizeText(element.getAttribute('href'), 140),
  };
}

function resolveKeyLabel(event: KeyboardEvent) {
  if (event.isComposing) return null;
  if (event.key === 'Unidentified' || event.key === 'Process') return null;

  if (event.key.length === 1) {
    return isEditableElement(event.target instanceof Element ? event.target : null) ? 'Character key' : event.key;
  }

  return event.key === ' ' ? 'Space' : event.key;
}

export function InteractionTracker() {
  const pathname = usePathname() || '/';
  const queueRef = useRef<InteractionEventPayload[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flushQueue = (useBeacon = false) => {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      const batch = queueRef.current.splice(0, MAX_BATCH_SIZE);
      if (batch.length === 0) {
        return;
      }

      const body = JSON.stringify({ events: batch });

      if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const sent = navigator.sendBeacon('/api/session/interactions', new Blob([body], { type: 'application/json' }));
        if (sent) {
          return;
        }
      }

      void fetch('/api/session/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        queueRef.current = [...batch, ...queueRef.current].slice(-MAX_QUEUE_SIZE);
      });
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushQueue();
      }, FLUSH_INTERVAL_MS);
    };

    const enqueue = (event: InteractionEventPayload) => {
      queueRef.current.push(event);
      if (queueRef.current.length > MAX_QUEUE_SIZE) {
        queueRef.current.splice(0, queueRef.current.length - MAX_QUEUE_SIZE);
      }
      if (queueRef.current.length >= MAX_BATCH_SIZE) {
        flushQueue();
        return;
      }
      scheduleFlush();
    };

    enqueue({
      action: 'navigation.view',
      happenedAt: new Date().toISOString(),
      path: pathname,
      label: `Viewed ${pathname}`,
      metadata: {
        path: pathname,
      },
    });

    const handleClick = (event: MouseEvent) => {
      const target = resolveInteractionTarget(event.target);
      if (!target) return;

      enqueue({
        action: 'interaction.click',
        happenedAt: new Date().toISOString(),
        path: pathname,
        label: target.targetLabel ? `Clicked ${target.targetLabel}` : `Clicked ${target.targetTag}`,
        detail: target.targetHref || target.targetType || target.targetRole || null,
        entityId: target.entityId,
        metadata: {
          path: pathname,
          targetLabel: target.targetLabel,
          targetTag: target.targetTag,
          targetRole: target.targetRole,
          targetType: target.targetType,
          targetHref: target.targetHref,
        },
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const keyLabel = resolveKeyLabel(event);
      if (!keyLabel) return;

      const target = resolveInteractionTarget(event.target);
      const editable = isEditableElement(event.target instanceof Element ? event.target : null);

      enqueue({
        action: 'interaction.keydown',
        happenedAt: new Date().toISOString(),
        path: pathname,
        label: `Pressed ${keyLabel}`,
        detail: target?.targetLabel || target?.targetTag || null,
        entityId: target?.entityId ?? null,
        metadata: {
          path: pathname,
          key: keyLabel,
          editable,
          shortcut: event.metaKey || event.ctrlKey || event.altKey,
          targetLabel: target?.targetLabel ?? null,
          targetTag: target?.targetTag ?? null,
          targetRole: target?.targetRole ?? null,
          targetType: target?.targetType ?? null,
        },
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushQueue(true);
      }
    };

    const handleBeforeUnload = () => {
      flushQueue(true);
    };

    window.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushQueue(true);
    };
  }, [pathname]);

  return null;
}
