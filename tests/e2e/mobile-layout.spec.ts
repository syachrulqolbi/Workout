import { expect, test } from '@playwright/test';
import { createDefaultWorkoutData } from '../../lib/workout-data';

test('authenticated mobile shell respects safe spacing and keeps navigation clear', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile shell check');

  await page.route('**/api/auth/session', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ user: { email: 'admin@example.com', displayName: 'Syachrul' } }),
  }));
  await page.route('**/api/data', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: createDefaultWorkoutData(), revision: 1, migrated: false, isAdmin: true }),
  }));

  await page.goto('/');
  const heading = page.locator('.topbar');
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(heading).toBeVisible();
  await expect(navigation).toBeVisible();

  const headingBox = await heading.boundingBox();
  const navigationBox = await navigation.boundingBox();
  expect(headingBox?.y).toBeGreaterThanOrEqual(32);
  expect(navigationBox?.x).toBeGreaterThanOrEqual(15);
  expect(navigationBox?.width).toBeLessThanOrEqual(358);
  expect(navigationBox ? 844 - navigationBox.y - navigationBox.height : Number.NaN).toBeCloseTo(12, 0);
  await expect(navigation.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
});
