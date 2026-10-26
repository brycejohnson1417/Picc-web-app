import { describe, expect, it, vi } from 'vitest';
import { renderDailyBriefingEmail, sendDailyBriefingEmail } from '@/lib/server/daily-briefing-email';

const {send}=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('@/lib/server/transactional-email',()=>({sendTransactionalEmail:send}));

describe('daily briefing email', () => {
  it('renders the requested sections without an LLM', () => {
    const item = { id: 'store-1', name: 'Harbor & House', repEmails: ['rep@picc.co'], followUpNeeded: true, followUpDate: '2026-08-14', followUpReason: 'Confirm order', statusKey: 'lead - hot', pppStatus: 'Onboarding', lastSampleDate: '2026-08-12' };
    const rendered = renderDailyBriefingEmail({ followUps: [item], pppOnboarding: [item], warmLeads: [item] }, '2026-08-14', 'https://piccnewyork.org');
    expect(rendered.subject).toContain('1 follow-ups due');
    expect(rendered.html).toContain('Follow-ups due today or overdue');
    expect(rendered.html).toContain('Open PPP onboarding');
    expect(rendered.html).toContain('Warm leads to close');
    expect(rendered.html).toContain('Harbor &amp; House');
  });

  it('sends through the configured transactional email boundary', async () => {
    send.mockResolvedValue({status:'SENT',providerMessageId:'message-1',error:null});
    const input={orgId:'org-a',to:'rep@example.com',subject:'Daily',html:'<p>Hello</p>',idempotencyKey:'daily-1'};
    await sendDailyBriefingEmail(input);
    expect(send).toHaveBeenCalledWith(input);
    send.mockResolvedValue({status:'FAILED',error:'Mailjet rejected message'});
    await expect(sendDailyBriefingEmail(input)).rejects.toThrow('Mailjet rejected message');
  });
});
