import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';

export class InvalidJsonBodyError extends Error {
  constructor(message = 'Invalid JSON payload') {
    super(message);
    this.name = 'InvalidJsonBodyError';
  }
}

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new InvalidJsonBodyError();
  }

  return schema.parse(body);
}

export function routeErrorResponse(
  error: unknown,
  options?: {
    fallbackMessage?: string;
    zodMessage?: string;
    invalidJsonMessage?: string;
    statusByMessage?: Record<string, number>;
  },
) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: options?.zodMessage ?? 'Invalid request payload',
        details: error.issues,
      },
      { status: 400 },
    );
  }

  if (error instanceof InvalidJsonBodyError) {
    return NextResponse.json(
      {
        error: options?.invalidJsonMessage ?? error.message,
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : options?.fallbackMessage ?? 'Request failed';
  const status = options?.statusByMessage?.[message] ?? 500;

  return NextResponse.json(
    {
      error: message || options?.fallbackMessage || 'Request failed',
    },
    { status },
  );
}
