import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
  sessionUserToAppUser,
  verifySessionToken,
} from '../lib/server/session';

const user = {
  uid: 'firebase-user-1',
  email: 'user@example.com',
  name: 'Workout User',
  picture: 'https://example.com/user.jpg',
  email_verified: true as const,
};

describe('first-party workout sessions', () => {
  beforeEach(() => {
    vi.stubEnv('WORKOUT_SESSION_SECRET', 'a-secure-test-secret-with-more-than-32-characters');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a verified user without exposing server-only fields to the app', () => {
    const now = Date.UTC(2026, 9, 20);
    const decoded = verifySessionToken(createSessionToken(user, now), now + 1_000);
    expect(decoded).toEqual(user);
    expect(decoded && sessionUserToAppUser(decoded)).toEqual({
      uid: user.uid,
      email: user.email,
      displayName: user.name,
      photoURL: user.picture,
    });
  });

  it('rejects a modified signature', () => {
    const token = createSessionToken(user);
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('rejects an expired session', () => {
    const now = Date.UTC(2026, 9, 20);
    const token = createSessionToken(user, now);
    expect(verifySessionToken(token, now + (SESSION_MAX_AGE_SECONDS + 1) * 1_000)).toBeNull();
  });
});
