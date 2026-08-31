import { NextResponse } from 'next/server';
import type { z, ZodError, ZodTypeAny } from 'zod';
import { currentUser, type SessionUser } from './supabase/server';
import { logger } from '../../backend/logger/pino';

/** Thrown by route handlers to short-circuit with a specific status. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const ok = <T>(data: T, init?: ResponseInit) =>
  NextResponse.json({ ok: true, data }, init);

export const fail = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status });

/** Resolve the caller or throw 401. Every mutating route must call this. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, 'Sign in to continue');
  return user;
}

/** Parse and validate a JSON body, returning the schema's *output* type. */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = (result.error as ZodError).issues[0];
    throw new ApiError(400, issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request');
  }
  return result.data;
}

/** Wrap a handler so thrown errors become clean JSON responses. */
export function route<Args extends unknown[]>(
  name: string,
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof ApiError) return fail(error.status, error.message);
      const message = error instanceof Error ? error.message : 'Something went wrong';
      logger.error({ error, route: name }, 'api.error');
      return fail(500, message);
    }
  };
}
