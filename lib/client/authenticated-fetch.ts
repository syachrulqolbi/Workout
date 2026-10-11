import type { User } from 'firebase/auth';

export async function authenticatedFetch(user: User, input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
