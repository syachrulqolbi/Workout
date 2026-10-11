import { apiJson } from '@/lib/server/api-response';
import { firestoreDatabaseId, getFirestore, workoutUsersCollection } from '@/lib/server/firestore';

export async function getHealth() {
  try {
    await getFirestore().collection(workoutUsersCollection).limit(1).get();
    return apiJson({ status: 'ok', database: firestoreDatabaseId });
  } catch (cause) {
    console.error('Firestore health check failed', cause);
    return apiJson({ status: 'error' }, { status: 503 });
  }
}
