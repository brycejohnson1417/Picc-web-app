import { NextResponse } from 'next/server';
import { type ZodSchema } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import type { AppRole } from '@/lib/types/rbac';

type ApiHandlerContext = {
  orgId: string;
  userId: string;
  email: string;
  role?: AppRole;
};

type ApiHandlerConfig<T = unknown> = {
  allowedRoles?: AppRole[];
  schema?: ZodSchema<T>;
};

export function createApiHandler<T = unknown>(
  handler: (req: Request, ctx: ApiHandlerContext, data: T) => Promise<NextResponse>,
  config: ApiHandlerConfig<T> = {},
) {
  return async (req: Request) => {
    try {
      const ctx = await guard(config.allowedRoles);
      if ('error' in ctx) return ctx.error;

      let data: T = {} as T;
      if (config.schema) {
        data = await parseJsonBody(req, config.schema);
      }

      return await handler(req, ctx as ApiHandlerContext, data);
    } catch (error) {
      return routeErrorResponse(error);
    }
  };
}
