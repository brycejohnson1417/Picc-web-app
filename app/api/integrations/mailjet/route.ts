import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { getMailjetStatus, saveMailjetConnection, disconnectMailjet, testMailjetConnection, MailjetSettingsError } from '@/lib/server/mailjet-connection';
const configSchema = z.object({apiKey:z.string().trim().max(256).optional(),apiSecret:z.string().trim().max(256).optional(),fromEmail:z.string().trim().email().max(254),fromName:z.string().trim().min(1).max(100)});
const json = (value: unknown, status=200) => NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({error:'Check the email address and required fields.'},400);
  if (error instanceof MailjetSettingsError) return json({error:error.message},400);
  return json({error:'Email settings are temporarily unavailable. Try again or contact your administrator.'},503);
}
export async function GET() {
  const ctx=await guard(['ADMIN']);if ('error' in ctx) return ctx.error;
  try {return json(await getMailjetStatus(ctx.orgId));} catch(error) {return failure(error);}
}
export async function PUT(request: Request) {
  const ctx=await guard(['ADMIN']);if ('error' in ctx) return ctx.error;
  try {return json(await saveMailjetConnection(ctx.orgId,configSchema.parse(await request.json())));} catch(error) {return failure(error);}
}
export async function POST(request: Request) {
  const ctx=await guard(['ADMIN']);if ('error' in ctx) return ctx.error;
  try {const {recipient,requestId}=z.object({recipient:z.string().trim().email().max(254),requestId:z.string().uuid()}).parse(await request.json());return json(await testMailjetConnection(ctx.orgId,recipient,requestId));} catch(error) {return failure(error);}
}
export async function DELETE() {
  const ctx=await guard(['ADMIN']);if ('error' in ctx) return ctx.error;
  try {return json(await disconnectMailjet(ctx.orgId));} catch(error) {return failure(error);}
}
