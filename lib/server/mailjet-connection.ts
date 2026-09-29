import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyMailjetSender, type MailjetConfig } from '@/lib/email/mailjet';

export class MailjetSettingsError extends Error {}
const storedSchema = z.object({ fromEmail: z.string().email(), fromName: z.string(), encryptedKey: z.string(), encryptedSecret: z.string() });
const connectionId = (orgId: string) => `mailjet:${orgId}`;
export const mailjetEncryptionReady = () => (process.env.MAILJET_ENCRYPTION_KEY?.trim().length ?? 0) >= 32;
function encryptionKey() {
  if (!mailjetEncryptionReady()) throw new MailjetSettingsError('Secure email setup is not ready. Ask an administrator to finish deployment setup.');
  return createHash('sha256').update(process.env.MAILJET_ENCRYPTION_KEY!.trim()).digest();
}
export function encryptMailjetSecret(orgId: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(orgId));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
export function decryptMailjetSecret(orgId: string, value: string) {
  const [version,iv,tag,data,extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data || extra) throw new MailjetSettingsError('Saved credentials could not be opened. Reconnect Mailjet.');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv,'base64url'));
  cipher.setAAD(Buffer.from(orgId)); cipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');
}
async function connection(orgId: string) {
  return prisma.integrationConnection.findFirst({where:{id:connectionId(orgId),orgId,provider:'MAILJET'}});
}
export async function getMailjetConfig(orgId: string): Promise<MailjetConfig | null> {
  const row = await connection(orgId);
  if (!row?.enabled) return null;
  const config = storedSchema.parse(row.config);
  return {apiKey:decryptMailjetSecret(orgId,config.encryptedKey),apiSecret:decryptMailjetSecret(orgId,config.encryptedSecret),fromEmail:config.fromEmail,fromName:config.fromName};
}
export async function getMailjetStatus(orgId: string) {
  const row = await connection(orgId);
  const parsed = storedSchema.safeParse(row?.config);
  return { configured: Boolean(row?.enabled && parsed.success), encryptionReady: mailjetEncryptionReady(),
    fromEmail: parsed.success ? parsed.data.fromEmail : '', fromName: parsed.success ? parsed.data.fromName : '',
    validatedAt: row?.lastSyncedAt?.toISOString() ?? null, schedulerEnabled: false };
}
export async function saveMailjetConnection(orgId: string, input: {apiKey?: string;apiSecret?: string;fromEmail:string;fromName:string}) {
  encryptionKey();
  const previous = input.apiKey && input.apiSecret ? null : await getMailjetConfig(orgId);
  const config = {apiKey:input.apiKey || previous?.apiKey || '',apiSecret:input.apiSecret || previous?.apiSecret || '',fromEmail:input.fromEmail,fromName:input.fromName};
  if (!config.apiKey || !config.apiSecret) throw new MailjetSettingsError('Enter both your Mailjet API key and secret.');
  try { await verifyMailjetSender(config); } catch(error) { throw new MailjetSettingsError(error instanceof Error ? error.message : 'Mailjet validation failed.'); }
  const encrypted = {fromEmail:config.fromEmail,fromName:config.fromName,encryptedKey:encryptMailjetSecret(orgId,config.apiKey),encryptedSecret:encryptMailjetSecret(orgId,config.apiSecret)};
  await prisma.integrationConnection.upsert({where:{id:connectionId(orgId)},create:{id:connectionId(orgId),orgId,provider:'MAILJET',name:'Mailjet',enabled:true,status:'SUCCESS',config:encrypted,lastSyncedAt:new Date()},update:{config:encrypted,enabled:true,status:'SUCCESS',lastSyncedAt:new Date()}});
  return getMailjetStatus(orgId);
}
export async function disconnectMailjet(orgId: string) {
  await prisma.integrationConnection.updateMany({where:{id:connectionId(orgId),orgId,provider:'MAILJET'},data:{enabled:false,status:'IDLE',config:{},lastSyncedAt:null}});
  return getMailjetStatus(orgId);
}
export async function testMailjetConnection(orgId: string, recipient: string, requestId: string = randomUUID()) {
  const config = await getMailjetConfig(orgId);
  if (!config) throw new MailjetSettingsError('Connect Mailjet before sending a test.');
  const { dispatchMailjetEmail } = await import('./mailjet-dispatch');
  const result = await dispatchMailjetEmail(orgId,config,{to:recipient,subject:'PICC email connection test',text:'Your PICC Mailjet connection submitted this test email. Confirm that it arrived in the expected inbox.',html:'<p>Your PICC Mailjet connection submitted this test email. Confirm that it arrived in the expected inbox.</p>',idempotencyKey:`mailjet-test-${requestId}`});
  if (result.status !== 'SENT') throw new MailjetSettingsError(result.error || 'Mailjet did not accept the test email.');
  return {accepted:true,recipient,providerMessageId:result.providerMessageId};
}
