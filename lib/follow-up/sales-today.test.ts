import { describe, expect, it } from 'vitest';
import { buildTodayQueues, dateAfterToday, followUpDisplayText, followUpPatch, parseTodayPayload, type TodayStore } from './sales-today';

const store = (overrides: Partial<TodayStore> = {}): TodayStore => ({
  id: 'account-1', name: 'Account', notionPageId: 'account-1', repNames: ['Rep A'], status: 'Customer',
  followUpNeeded: true, followUpDate: '2026-11-05', followUpReason: 'Review assortment', pppStatus: 'Approved & Connected',
  ...overrides,
});

describe('sales Today queues', () => {
  it('separates due, future and undated open follow-ups without reviving completed ones', () => {
    const queues = buildTodayQueues([store(), store({ id: 'old', followUpDate: '2026-11-04' }), store({ id: 'later', followUpDate: '2026-11-08' }), store({ id: 'no-date', followUpDate: null }), store({ id: 'done', followUpNeeded: false })], '2026-11-05');
    expect(queues.due.map(row => row.id)).toEqual(['account-1', 'old']);
    expect(queues.upcoming.map(row => row.id)).toEqual(['later']);
    expect(queues.unscheduled.map(row => row.id)).toEqual(['no-date']);
  });

  it('uses rep membership for shared accounts and never duplicates a queue item', () => {
    const queues = buildTodayQueues([store({ repNames: ['Rep A', 'Rep B'] }), store({ id: 'other', repNames: ['Rep C'] })], '2026-11-05', 'Rep B');
    expect(queues.due).toHaveLength(1);
  });

  it('keeps unverified sample gaps out and does not use last edited time as PPP age', () => {
    const queues = buildTodayQueues([store({ id: 'waiting', pppStatus: 'Onboarding Pending', pppSince: null, lastSampleDate: '2026-10-01' }), store({ id: 'known', sampleWithoutConversion: true }), store({ id: 'active', pppStatus: 'Self-Managed Inventory PPP' })], '2026-11-05');
    expect(queues.ppp.map(row => row.id)).toEqual(['waiting']);
    expect(queues.samples.map(row => row.id)).toEqual(['known']);
    expect(queues.ppp[0].pppAgeDays).toBeNull();
  });

  it('surfaces stated payment conditions without treating unknown credit as clear', () => {
    const queues = buildTodayQueues([store({ paymentStatus: 'COD' }), store({ id: 'clear', paymentStatus: 'Send/Good' }), store({ id: 'unknown', paymentStatus: null }), store({ id: 'required', paymentStatus: 'Payment Required' })], '2026-11-05');
    expect(queues.payments.map(row => row.id).sort()).toEqual(['account-1', 'required']);
  });

  it('updates only follow-up fields and keeps a snoozed action unchanged', () => {
    expect(followUpPatch('complete', '2026-11-05')).toEqual({ followUpNeeded: false });
    expect(followUpPatch('tomorrow', '2026-11-05')).toEqual({ followUpNeeded: true, followUpDate: '2026-11-06' });
    expect(dateAfterToday('2026-10-31', 1)).toBe('2026-11-01');
    expect(dateAfterToday('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('rejects malformed freshness and duplicate accounts before displaying queue counts', () => {
    const payload = { asOf: '2026-11-05T20:00:00Z', today: '2026-11-05', viewerRep: null, stores: [store()] };
    expect(parseTodayPayload(payload).stores).toHaveLength(1);
    expect(() => parseTodayPayload({ ...payload, asOf: 'unknown' })).toThrow();
    expect(() => parseTodayPayload({ ...payload, today: '2026-02-30' })).toThrow();
    expect(() => parseTodayPayload({ ...payload, stores: [store(), store()] })).toThrow();
  });

  it('shows readable next-action text without changing the stored Markdown', () => {
    const raw = '**Review order** with [Account West](https://example.test/Account%20West)\n\nCall buyer.';
    const account = store({ followUpReason: raw });
    expect(followUpDisplayText(account.followUpReason)).toBe('Review order with Account West Call buyer.');
    expect(account.followUpReason).toBe(raw);
  });

  it('orders due work by recent date by default while preserving oldest-first and chronological upcoming', () => {
    const accounts = [store({ id: 'old', followUpDate: '2025-09-01' }), store({ id: 'recent', followUpDate: '2026-11-04' }), store(), store({ id: 'future-late', followUpDate: '2026-12-01' }), store({ id: 'future-soon', followUpDate: '2026-11-06' })];
    expect(buildTodayQueues(accounts, '2026-11-05').due.map(row => row.id)).toEqual(['account-1', 'recent', 'old']);
    expect(buildTodayQueues(accounts, '2026-11-05', '', 'oldest').due.map(row => row.id)).toEqual(['old', 'recent', 'account-1']);
    expect(buildTodayQueues(accounts, '2026-11-05').upcoming.map(row => row.id)).toEqual(['future-soon', 'future-late']);
  });
});
