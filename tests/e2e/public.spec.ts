import { expect, test } from '@playwright/test';

test('public landing page is usable without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Workout/);
  await expect(page.getByRole('heading', { name: /Progress you can prove/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('privacy information and PWA manifest are available', async ({ page, request }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: /Your training data stays personal/i })).toBeVisible();
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ short_name: 'Workout', display: 'standalone' });
  const serviceWorker = await request.get('/sw.js');
  expect(serviceWorker.ok()).toBe(true);
  expect(serviceWorker.headers()['cache-control']).toContain('no-cache');
  expect(await serviceWorker.text()).toContain("workout-shell-v2");
});

test('private workout data rejects unauthenticated browser requests', async ({ request }) => {
  const response = await request.get('/api/data');
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: 'Sign in is required.' });
});
