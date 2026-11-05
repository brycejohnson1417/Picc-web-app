import { z } from 'zod';

const nullableText = z.string().nullable().optional();
const todayStoreSchema = z.object({
  id: z.string().min(1), notionPageId: z.string().optional(), name: z.string(), repNames: z.array(z.string()), status: z.string(),
  locationAddress: nullableText, city: nullableText, followUpNeeded: z.boolean().nullable().optional(),
  followUpDate: nullableText, followUpReason: nullableText, pppStatus: nullableText, pppSince: nullableText, pppNotes: nullableText,
  waitingOn: nullableText, paymentStatus: nullableText, paymentDaysAvg: z.number().finite().nullable().optional(),
  sampleWithoutConversion: z.boolean().nullable().optional(), lastSampleDate: nullableText,
});
export type TodayStore = z.infer<typeof todayStoreSchema>;
export type TodayQueueKey = 'due' | 'upcoming' | 'unscheduled' | 'ppp' | 'payments' | 'samples';
export type TodayRow = TodayStore & { dueDays: number | null; pppAgeDays: number | null };
export type TodayPayload = {
  asOf: string;
  today: string;
  viewerRep: string | null;
  stores: TodayStore[];
  coverage?: Record<string, unknown>;
};

export function dateOnly(value: string | null | undefined) {
  const text = value?.slice(0, 10);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(text) ? text : null;
}

function dayDifference(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function dateAfterToday(today: string, days: number) {
  const day = dateOnly(today);
  if (!day) throw new Error('A valid current date is required.');
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function followUpPatch(action: 'complete' | 'tomorrow', today: string) {
  return action === 'complete' ? { followUpNeeded: false } : { followUpNeeded: true, followUpDate: dateAfterToday(today, 1) };
}

export function followUpDisplayText(value: string | null | undefined) {
  return (value ?? '').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
}

const PPP_WAITING = new Set(['onboarding pending', 'api key needed to complete', 'intro to ppp only']);
const CLEAR_PAYMENT = new Set(['send/good', 'good', 'clear', 'not applicable', 'n/a']);

export function buildTodayQueues(stores: TodayStore[], today: string, rep = '', dueOrder: 'recent' | 'oldest' = 'recent'): Record<TodayQueueKey, TodayRow[]> {
  if (!dateOnly(today)) throw new Error('A valid current date is required.');
  const rows = stores.filter(store => !rep || (rep === 'Unassigned' ? !store.repNames.length : store.repNames.includes(rep))).map(store => {
    const due = dateOnly(store.followUpDate), pppSince = dateOnly(store.pppSince);
    return { ...store, dueDays: due ? dayDifference(today, due) : null, pppAgeDays: pppSince && pppSince <= today ? dayDifference(pppSince, today) : null };
  });
  const followUps = rows.filter(row => row.followUpNeeded === true);
  const byDue = (a: TodayRow, b: TodayRow) => (a.dueDays ?? Infinity) - (b.dueDays ?? Infinity) || a.name.localeCompare(b.name);
  return {
    due: followUps.filter(row => row.dueDays !== null && row.dueDays <= 0).sort(dueOrder === 'oldest' ? byDue : (a, b) => b.dueDays! - a.dueDays! || a.name.localeCompare(b.name)),
    upcoming: followUps.filter(row => row.dueDays !== null && row.dueDays > 0).sort(byDue),
    unscheduled: followUps.filter(row => row.dueDays === null).sort((a, b) => a.name.localeCompare(b.name)),
    ppp: rows.filter(row => PPP_WAITING.has(row.pppStatus?.trim().toLowerCase() ?? '')).sort((a, b) => (b.pppAgeDays ?? -1) - (a.pppAgeDays ?? -1) || a.name.localeCompare(b.name)),
    payments: rows.filter(row => row.paymentStatus?.trim() && !CLEAR_PAYMENT.has(row.paymentStatus.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    samples: rows.filter(row => row.sampleWithoutConversion === true).sort((a, b) => (dateOnly(a.lastSampleDate) ?? '').localeCompare(dateOnly(b.lastSampleDate) ?? '') || a.name.localeCompare(b.name)),
  };
}

const payloadSchema = z.object({
  asOf: z.string().datetime({ offset: true }), today: z.string().refine(value => dateOnly(value) === value), viewerRep: z.string().nullable(),
  stores: z.array(todayStoreSchema).refine(stores => new Set(stores.map(store => store.id)).size === stores.length),
  coverage: z.record(z.unknown()).optional(),
});

export function parseTodayPayload(value: unknown): TodayPayload {
  const parsed = payloadSchema.safeParse(value);
  if (!parsed.success) throw new Error('Today’s account data is incomplete.');
  return parsed.data;
}
