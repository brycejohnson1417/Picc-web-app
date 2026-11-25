import { z } from 'zod';

export const accountSchema = z.object({
  name: z.string().min(2).max(200),
  licenseNumber: z.string().min(2).max(120),
  address1: z.string().min(2).max(250),
  city: z.string().min(2).max(120),
  state: z.string().min(2).max(30),
  zipcode: z.string().min(3).max(12),
  phone: z.string().max(30).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const contactSchema = z.object({
  accountId: z.string().cuid(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  roleTitle: z.string().min(1).max(120),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const notionPageIdSchema = z
  .string()
  .trim()
  .regex(
    /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    'Invalid Notion page ID',
  );

export const notionContactCreateSchema = z.object({
  accountPageId: notionPageIdSchema,
  name: z.string().trim().min(1).max(160),
  position: z.string().trim().max(160).default(''),
  email: z.string().trim().email().max(320).nullable(),
  phone: z.string().trim().max(40).nullable(),
  roles: z.array(z.enum(['PRIMARY_CONTACT', 'SECOND_CONTACT', 'PPP_2', 'PPP_3', 'BILLING_CONTACT'])).max(5).default([]),
  overwriteRoles: z.boolean().default(false),
  expectedPrimaryReplacement: z.object({ name: z.string().max(2000), email: z.string().nullable(), phone: z.string().nullable(), position: z.string().nullable() }).optional(),
  expectedPrimary: z.object({ name: z.string().max(2000), email: z.string().nullable(), phone: z.string().nullable(), position: z.string().nullable(), revision: z.string().min(1) }).optional(),
});

export const notionContactRetrySchema = z.object({
  accountPageId: notionPageIdSchema,
  contactPageId: notionPageIdSchema,
  roles: z.array(z.enum(['PRIMARY_CONTACT', 'SECOND_CONTACT', 'PPP_2', 'PPP_3', 'BILLING_CONTACT'])).max(5).optional(),
});

export const quickLogSchema = z.object({
  accountId: z.string().cuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  channel: z.enum(['EMAIL', 'SMS', 'PHONE_CALL', 'WHATSAPP', 'OTHER']).optional(),
});
