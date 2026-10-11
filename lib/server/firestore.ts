import 'server-only';

import { Firestore } from '@google-cloud/firestore';

export const firestoreCollection = process.env.FIRESTORE_COLLECTION ?? 'form-workspaces';
export const workoutUsersCollection = process.env.WORKOUT_USERS_COLLECTION ?? 'workout-users';
export const workoutAuditCollection = process.env.WORKOUT_AUDIT_COLLECTION ?? 'workout-audit';
export const workoutRateLimitCollection = process.env.WORKOUT_RATE_LIMIT_COLLECTION ?? 'workout-rate-limits';
export const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID ?? 'form-workout';

let firestore: Firestore | undefined;

export function getFirestore() {
  firestore ??= new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    databaseId: firestoreDatabaseId,
    ignoreUndefinedProperties: true,
  });
  return firestore;
}
