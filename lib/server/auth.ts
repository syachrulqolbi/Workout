import 'server-only';

import { applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { NextRequest } from 'next/server';

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'syachrulqolbinursepti@gmail.com').toLowerCase();

export class AuthenticationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function adminApp() {
  return getApps().length ? getApp() : initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT ?? 'personal-project-414620',
  });
}

export async function requireUser(request: NextRequest): Promise<DecodedIdToken> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AuthenticationError(401, 'Sign in is required.');
  try {
    return await getAuth(adminApp()).verifyIdToken(authorization.slice(7));
  } catch {
    throw new AuthenticationError(401, 'Your session is invalid or has expired.');
  }
}

export function requireAdmin(user: DecodedIdToken) {
  if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL || user.email_verified === false) {
    throw new AuthenticationError(403, 'Administrator access is required.');
  }
}
