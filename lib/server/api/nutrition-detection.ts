import { Timestamp } from '@google-cloud/firestore';
import { GoogleAuth } from 'google-auth-library';
import type { NextRequest } from 'next/server';
import { apiError, apiFailure, apiJson } from '@/lib/server/api-response';
import { requireUser } from '@/lib/server/auth';
import { getFirestore, workoutRateLimitCollection } from '@/lib/server/firestore';
import { parseNutritionLabel } from '@/lib/nutrition-label';

const MAX_IMAGE_BYTES = 6_000_000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HOURLY_SCAN_LIMIT = 15;
const DAILY_SCAN_LIMIT = 50;

class ScanRateLimitError extends Error {}

async function consumeScanAllowance(uid: string) {
  const now = Date.now();
  const hourWindow = Math.floor(now / 3_600_000) * 3_600_000;
  const dayWindow = Math.floor(now / 86_400_000) * 86_400_000;
  const database = getFirestore();
  const reference = database.collection(workoutRateLimitCollection).doc(`nutrition-${uid}`);
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const stored = snapshot.data() ?? {};
    const hourCount = Number(stored.hourWindow) === hourWindow ? Number(stored.hourCount ?? 0) : 0;
    const dayCount = Number(stored.dayWindow) === dayWindow ? Number(stored.dayCount ?? 0) : 0;
    if (hourCount >= HOURLY_SCAN_LIMIT || dayCount >= DAILY_SCAN_LIMIT) throw new ScanRateLimitError();
    transaction.set(reference, {
      uid,
      hourWindow,
      hourCount: hourCount + 1,
      dayWindow,
      dayCount: dayCount + 1,
      updatedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + 3 * 86_400_000),
    }, { merge: true });
  });
}

export async function detectNutrition(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const form = await request.formData();
    const image = form.get('image');
    if (!(image instanceof File)) return apiError('Choose a nutrition-label image first.', 422);
    if (!ALLOWED_TYPES.has(image.type)) return apiError('Use a JPEG, PNG or WebP image.', 415);
    if (!image.size || image.size > MAX_IMAGE_BYTES) return apiError('The image must be smaller than 6 MB.', 413);
    try {
      await consumeScanAllowance(user.uid);
    } catch (cause) {
      if (cause instanceof ScanRateLimitError) return apiError('You have reached the nutrition scan limit. Try again later or enter the values manually.', 429);
      throw cause;
    }

    const content = Buffer.from(await image.arrayBuffer()).toString('base64');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    if (!accessToken.token) return apiError('Nutrition detection is temporarily unavailable.', 503);

    const visionResponse = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': process.env.GOOGLE_CLOUD_PROJECT ?? 'personal-project-414620',
      },
      body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }] }] }),
      cache: 'no-store',
    });
    if (!visionResponse.ok) {
      console.error('Vision API failed', visionResponse.status, await visionResponse.text());
      return apiError('The label reader is temporarily unavailable. You can still enter the values manually.', 503);
    }
    const payload = await visionResponse.json() as { responses?: Array<{ fullTextAnnotation?: { text?: string }; error?: { message?: string } }> };
    const result = payload.responses?.[0];
    if (result?.error) return apiError('The label could not be read. Try a brighter, sharper photo.', 422);
    const text = result?.fullTextAnnotation?.text?.trim() ?? '';
    if (!text) return apiError('No nutrition text was found. Try a closer photo of the full label.', 422);

    const nutrition = parseNutritionLabel(text);
    if (!nutrition.detectedFields) return apiError('Nutrition values were not recognised. Try a straighter photo or enter them manually.', 422);
    return apiJson(nutrition);
  } catch (cause) {
    return apiFailure(cause, 'Nutrition detection failed', 'The nutrition label could not be processed.');
  }
}
