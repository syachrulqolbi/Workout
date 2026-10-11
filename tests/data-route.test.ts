import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createDefaultWorkoutData } from '../lib/workout-data';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getUser: vi.fn(),
  setUser: vi.fn(),
  readData: vi.fn(),
  readMain: vi.fn(),
  saveChanges: vi.fn(),
  saveData: vi.fn(),
  replaceData: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  ADMIN_EMAIL: 'admin@example.com',
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/server/firestore', () => ({
  workoutUsersCollection: 'workout-users',
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mocks.getUser, set: mocks.setUser }) }) }),
}));

vi.mock('@/lib/server/workout-repository', () => {
  class RevisionConflictError extends Error {}
  return {
    RevisionConflictError,
    WORKOUT_STORAGE_VERSION: 2,
    readWorkoutDataDocument: mocks.readData,
    readWorkoutMainDocument: mocks.readMain,
    replaceWorkoutDataDocument: mocks.replaceData,
    saveWorkoutDataChangesDocument: mocks.saveChanges,
    saveWorkoutDataDocument: mocks.saveData,
  };
});

describe('authenticated workout data route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ uid: 'user-1', email: 'user@example.com', name: 'User', picture: '', email_verified: true });
    mocks.getUser.mockResolvedValue({ exists: true, data: () => ({ revision: 3 }) });
    mocks.setUser.mockResolvedValue(undefined);
  });

  it('returns a bounded first history page for an authenticated user', async () => {
    const data = createDefaultWorkoutData();
    mocks.readData.mockResolvedValue({
      data,
      revision: 3,
      summary: { workoutCount: 130, strengthRecordCount: 600, cardioRecordCount: 40, mealCount: 4, activeWorkout: false },
      historyPage: { nextBefore: '2026-01-01T00:00:00.000Z', hasMore: true },
    });
    const { GET } = await import('../app/api/data/route');
    const response = await GET(new NextRequest('http://localhost/api/data', { headers: { authorization: 'Bearer valid' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 3, historyPage: { hasMore: true } });
    expect(mocks.readData).toHaveBeenCalledWith(expect.anything(), expect.anything(), 100);
  });

  it('saves a validated scoped change with its revision precondition', async () => {
    mocks.saveChanges.mockResolvedValue(4);
    const { PUT } = await import('../app/api/data/route');
    const response = await PUT(new NextRequest('http://localhost/api/data', {
      method: 'PUT',
      headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: 3, scopes: ['active'], changes: { activeWorkout: null } }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, revision: 4 });
    expect(mocks.saveChanges).toHaveBeenCalledWith(expect.anything(), { activeWorkout: null }, undefined, 3, ['active'], expect.objectContaining({ uid: 'user-1' }));
  });
});
