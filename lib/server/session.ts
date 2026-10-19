import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppUser } from '@/lib/auth-user';

export const SESSION_COOKIE_NAME = 'workout_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type SessionUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified: true;
};

type SessionPayload = SessionUser & {
  v: 1;
  iat: number;
  exp: number;
};

function sessionSecret() {
  const secret = process.env.WORKOUT_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('WORKOUT_SESSION_SECRET must contain at least 32 characters.');
  }
  return secret;
}

function signature(payload: string) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(user: SessionUser, now = Date.now()) {
  const issuedAt = Math.floor(now / 1_000);
  const payload: SessionPayload = {
    ...user,
    v: 1,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

export function verifySessionToken(token: string, now = Date.now()): SessionUser | null {
  const [encoded, receivedSignature, extra] = token.split('.');
  if (!encoded || !receivedSignature || extra) return null;

  const expectedSignature = signature(encoded);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    const nowSeconds = Math.floor(now / 1_000);
    if (payload.v !== 1 || typeof payload.uid !== 'string' || !payload.uid
      || payload.email_verified !== true || typeof payload.iat !== 'number'
      || typeof payload.exp !== 'number' || payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds) {
      return null;
    }
    return {
      uid: payload.uid,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      email_verified: true,
    };
  } catch {
    return null;
  }
}

export function sessionUserToAppUser(user: SessionUser): AppUser {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.name ?? null,
    photoURL: user.picture ?? null,
  };
}
