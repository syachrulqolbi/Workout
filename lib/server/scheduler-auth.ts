import 'server-only';

import { OAuth2Client } from 'google-auth-library';
import type { NextRequest } from 'next/server';

const googleClient = new OAuth2Client();

export async function verifySchedulerRequest(request: NextRequest, audience: string, expectedEmail: string) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: authorization.slice(7), audience });
    return ticket.getPayload()?.email === expectedEmail;
  } catch {
    return false;
  }
}
