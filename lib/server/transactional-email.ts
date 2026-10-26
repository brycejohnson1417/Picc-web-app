import 'server-only';
import { getMailjetConfig } from '@/lib/server/mailjet-connection';
import { type EmailResult, type MailjetMessage } from '@/lib/email/mailjet';
import { dispatchMailjetEmail } from '@/lib/server/mailjet-dispatch';
export type TransactionalEmailResult = EmailResult;
export async function transactionalEmailReady(orgId: string) {
  return Boolean(await getMailjetConfig(orgId).catch(() => null));
}
export async function sendTransactionalEmail(input: MailjetMessage & { orgId: string }): Promise<EmailResult> {
  try {
    const config = await getMailjetConfig(input.orgId);
    if (!config) return {status:'UNAVAILABLE',providerMessageId:null,error:'Connect Mailjet in Settings to enable email delivery.'};
    return await dispatchMailjetEmail(input.orgId,config,input);
  } catch {
    return {status:'UNAVAILABLE',providerMessageId:null,error:'Mailjet configuration is unavailable. Check the connection in Settings.'};
  }
}
