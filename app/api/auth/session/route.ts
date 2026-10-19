import { OAuth2Client } from 'google-auth-library';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getFirestore, workoutUsersCollection } from '@/lib/server/firestore';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  sessionUserToAppUser,
  type SessionUser,
  verifySessionToken,
} from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const googleClient = new OAuth2Client();

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const configuredOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).origin;
  if (origin === configuredOrigin) return true;
  return process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: 'high',
  });
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

async function resolveWorkoutUid(googleSubject: string, email: string) {
  const users = getFirestore().collection(workoutUsersCollection);
  const deterministicUid = `google-${googleSubject}`;
  if ((await users.doc(deterministicUid).get()).exists) return deterministicUid;

  const existing = await users.where('email', '==', email).limit(1).get();
  return existing.empty ? deterministicUid : existing.docs[0].id;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) return noStoreJson({ error: 'Sign in is required.' }, 401);
  return noStoreJson({ user: sessionUserToAppUser(session) });
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request)) return noStoreJson({ error: 'This sign-in request came from an untrusted origin.' }, 403);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return noStoreJson({ error: 'Google sign-in is not configured.' }, 503);
  const body = await request.json().catch(() => null) as { credential?: unknown } | null;
  if (typeof body?.credential !== 'string' || body.credential.length > 10_000) {
    return noStoreJson({ error: 'Google did not return a valid sign-in credential.' }, 422);
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: body.credential, audience: clientId });
    const googleUser = ticket.getPayload();
    if (!googleUser?.sub || !googleUser.email || googleUser.email_verified !== true) {
      return noStoreJson({ error: 'A verified Google email is required.' }, 403);
    }

    const session: SessionUser = {
      uid: await resolveWorkoutUid(googleUser.sub, googleUser.email),
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      email_verified: true,
    };
    const response = noStoreJson({ user: sessionUserToAppUser(session) });
    setSessionCookie(response, createSessionToken(session));
    return response;
  } catch (cause) {
    console.error('Google session sign-in failed', cause);
    return noStoreJson({ error: 'Google sign-in could not be verified. Please try again.' }, 401);
  }
}

export function DELETE(request: NextRequest) {
  if (!allowedOrigin(request)) return noStoreJson({ error: 'This sign-out request came from an untrusted origin.' }, 403);
  const response = noStoreJson({ signedOut: true });
  clearSessionCookie(response);
  return response;
}
