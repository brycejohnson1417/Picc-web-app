import { createHash } from 'node:crypto';

export type MailjetConfig = { apiKey: string; apiSecret: string; fromEmail: string; fromName: string };
export type MailjetMessage = { to: string; subject: string; html: string; text?: string; idempotencyKey: string };
export type EmailResult = { status: 'SENT' | 'FAILED' | 'UNAVAILABLE'; providerMessageId: string | null; error: string | null };
const headers = (config: MailjetConfig) => ({ Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`, 'Content-Type': 'application/json' });

export async function verifyMailjetSender(config: MailjetConfig, request: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await request(`https://api.mailjet.com/v3/REST/sender?Email=${encodeURIComponent(config.fromEmail)}`, {
      headers: headers(config), cache: 'no-store', signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
  } catch { throw new Error('Mailjet could not be reached. Check your connection and try again.'); }
  if (response.status === 401 || response.status === 403) throw new Error('Mailjet rejected these credentials. Check the API key and secret.');
  if (!response.ok) throw new Error(`Mailjet validation failed (${response.status}). Try again later.`);
  const payload = await response.json().catch(() => ({})) as { Data?: Array<{ Email?: string; Status?: string }> };
  const active = Array.isArray(payload.Data) && payload.Data.some((sender) => sender.Email?.toLowerCase() === config.fromEmail.toLowerCase() && sender.Status === 'Active');
  if (!active) throw new Error('This address is not an active verified sender in Mailjet. Verify it in Mailjet, then try again.');
}

export async function sendMailjetMessage(config: MailjetConfig, input: MailjetMessage, request: typeof fetch = fetch): Promise<EmailResult> {
  const failed = (error: string): EmailResult => ({ status: 'FAILED', providerMessageId: null, error });
  try {
    const campaign = `picc-${createHash('sha256').update(input.idempotencyKey).digest('hex')}`;
    const response = await request('https://api.mailjet.com/v3.1/send', {
      method: 'POST', headers: headers(config), signal: AbortSignal.timeout(15_000), redirect: 'error',
      body: JSON.stringify({ Messages: [{ From: { Email: config.fromEmail, Name: config.fromName }, To: [{ Email: input.to }],
        Subject: input.subject, HTMLPart: input.html, ...(input.text ? { TextPart: input.text } : {}),
        CustomID: input.idempotencyKey.slice(0, 255), CustomCampaign: campaign, DeduplicateCampaign: true }] }),
    });
    if (!response.ok) return failed(`Mailjet did not accept the email (${response.status}). Check the connection in Settings.`);
    const payload = await response.json().catch(() => ({})) as { Messages?: Array<{ Status?: string; To?: Array<{ MessageUUID?: string; MessageID?: string | number }> }> };
    const message = payload.Messages?.[0];
    const recipient = message?.To?.[0];
    if (message?.Status !== 'success' || !recipient || (!recipient.MessageUUID && !recipient.MessageID)) return failed('Mailjet did not confirm email acceptance. Check the sender and delivery log in Mailjet.');
    return { status: 'SENT', providerMessageId: recipient.MessageUUID || String(recipient.MessageID), error: null };
  } catch { return failed('Mailjet delivery could not be confirmed. Check Mailjet before retrying to avoid a duplicate.'); }
}
