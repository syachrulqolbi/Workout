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

  const exercisePicker = page.getByRole('combobox', { name: 'Choose an exercise for the muscle map' });
  const exerciseValue = await exercisePicker.locator('option').nth(1).getAttribute('value');
  expect(exerciseValue).toBeTruthy();
  await exercisePicker.selectOption(exerciseValue!);

  const levelScale = page.locator('.level-scale');
  const levelPanel = page.locator('.muscle-detail-panel');
  await expect(levelScale).toBeVisible();
  await expect(levelScale.getByRole('button')).toHaveCount(10);
  const scaleBox = await levelScale.boundingBox();
  const panelBox = await levelPanel.boundingBox();
  expect(scaleBox?.x).toBeGreaterThanOrEqual(panelBox?.x ?? 0);
  expect((scaleBox?.x ?? 0) + (scaleBox?.width ?? 0)).toBeLessThanOrEqual((panelBox?.x ?? 0) + (panelBox?.width ?? 0) + 1);
  const firstLevelBox = await levelScale.getByRole('button').nth(0).boundingBox();
  const sixthLevelBox = await levelScale.getByRole('button').nth(5).boundingBox();
  expect(sixthLevelBox?.y).toBeGreaterThan(firstLevelBox?.y ?? 0);
  await levelScale.getByRole('button', { name: /Show level 8/ }).click();
  await expect(levelPanel.getByText('VIEWING LEVEL 8 OF 10')).toBeVisible();
});
