import { NextResponse } from 'next/server';
import { AuthenticationError } from '@/lib/server/auth';

export function apiJson<T>(payload: T, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return NextResponse.json(payload, { ...init, headers });
}

export function apiError(message: string, status: number) {
  return apiJson({ error: message }, { status });
}

export function apiFailure(cause: unknown, logMessage: string, publicMessage: string) {
  if (cause instanceof AuthenticationError) return apiError(cause.message, cause.status);
  console.error(logMessage, cause);
  return apiError(publicMessage, 503);
}
