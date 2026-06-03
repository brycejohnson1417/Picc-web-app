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

export const quickLogSchema = z.object({
  accountId: z.string().cuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  channel: z.enum(['EMAIL', 'SMS', 'PHONE_CALL', 'WHATSAPP', 'OTHER']).optional(),
});
