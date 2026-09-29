import { sendTransactionalEmail } from '@/lib/server/transactional-email';
import { buildDailyBriefing, type BriefingStore } from '@/lib/follow-up/follow-up-intelligence';

type DailyBriefing = ReturnType<typeof buildDailyBriefing>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]!));
}

function section(title: string, items: BriefingStore[], detail: (item: BriefingStore) => string, appUrl: string) {
  const content = items.length
    ? items.slice(0, 20).map((item) => `<li style="margin:0 0 10px"><a href="${appUrl}/accounts/${encodeURIComponent(item.id)}" style="color:#b43214;font-weight:700">${escapeHtml(item.name)}</a><br><span style="color:#5d6877">${escapeHtml(detail(item))}</span></li>`).join('')
    : '<li style="color:#6b7280">Nothing due in this section.</li>';
  return `<h2 style="font-size:18px;margin:24px 0 10px;color:#18212d">${escapeHtml(title)} (${items.length})</h2><ul style="padding-left:20px;margin:0">${content}</ul>`;
}

export function renderDailyBriefingEmail(briefing: DailyBriefing, localDate: string, appUrl: string) {
  const body = [
    section('Follow-ups due today or overdue', briefing.followUps, (item) => `${item.followUpDate || 'No date'} · ${item.followUpReason || 'No reason logged'}`, appUrl),
    section('Open PPP onboarding', briefing.pppOnboarding, (item) => item.pppStatus || 'Onboarding', appUrl),
    section('Warm leads to close', briefing.warmLeads, (item) => item.lastSampleDate ? `Last sample ${item.lastSampleDate.slice(0, 10)}` : 'No sample date logged', appUrl),
  ].join('');
  return {
    subject: `PICC daily debrief — ${briefing.followUps.length} follow-ups due`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:680px;margin:auto;padding:28px;color:#18212d"><p style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#6b7280">PICC DAILY DEBRIEF · ${escapeHtml(localDate)}</p><h1 style="font-size:28px;margin:8px 0">Your sales action list</h1><p style="color:#5d6877;line-height:1.6">This briefing is selected deterministically from your assigned CRM accounts. No AI is required to create it.</p>${body}<p style="margin-top:28px"><a href="${appUrl}/home" style="display:inline-block;background:#c93412;color:white;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Open PICC</a></p></div>`,
  };
}

export async function sendDailyBriefingEmail(input: { orgId: string; to: string; subject: string; html: string; idempotencyKey: string }) {
  const result = await sendTransactionalEmail(input);
  if (result.status !== 'SENT') throw new Error(result.error || 'Mailjet did not accept the daily debrief.');
}
