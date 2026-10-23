import { expect, test } from '@playwright/test';
import { createDefaultWorkoutData } from '../../lib/workout-data';
import { buildWorkout } from '../../lib/workout-session';

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

test('history correction sheet keeps exercise values compact and uses the product theme', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile correction-sheet check');

  const data = createDefaultWorkoutData();
  data.workouts = [{
    id: 'session-1',
    date: '2026-10-23T08:30:00.000Z',
    planDay: 0,
    name: 'Push / Pull',
    focus: 'Chest, back and shoulders',
    duration: 72,
    exercises: 2,
    sets: 5,
    volume: 1250,
    cardioMinutes: 0,
    distanceKm: 0,
    calories: 0,
  }];
  data.exerciseHistory = [
    {
      id: 'record-1',
      sessionId: 'session-1',
      exerciseId: 'exercise-chest-fly-machine',
      exercise: 'Chest fly machine',
      date: '2026-10-23T08:30:00.000Z',
      type: 'strength',
      measurement: 'reps',
      loadMode: 'total',
      weight: 12.5,
      reps: 6,
      setsCompleted: 3,
      targetMet: true,
      durationSeconds: 0,
      durationMinutes: 0,
      distanceKm: 0,
      calories: 0,
      completedSets: [],
      estimated: false,
    },
    {
      id: 'record-2',
      sessionId: 'session-1',
      exerciseId: 'exercise-face-pull',
      exercise: 'Face pull',
      date: '2026-10-23T08:30:00.000Z',
      type: 'strength',
      measurement: 'reps',
      loadMode: 'total',
      weight: 10,
      reps: 15,
      setsCompleted: 2,
      targetMet: true,
      durationSeconds: 0,
      durationMinutes: 0,
      distanceKm: 0,
      calories: 0,
      completedSets: [],
      estimated: false,
    },
  ];

  await page.route('**/api/auth/session', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ user: { email: 'admin@example.com', displayName: 'Syachrul' } }),
  }));
  await page.route('**/api/data', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data, revision: 1, migrated: false, isAdmin: true }),
  }));

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Workout history' })).toBeVisible();
  await page.getByRole('button', { name: /Edit Push \/ Pull/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit workout history' });
  const firstRecord = dialog.locator('.history-record-card').first();
  const saveButton = dialog.getByRole('button', { name: 'Save corrections' });
  await expect(dialog).toBeVisible();
  await expect(firstRecord).toBeVisible();
  await expect(saveButton).toHaveCSS('background-color', 'rgb(51, 51, 51)');
  await expect(saveButton).toHaveCSS('color', 'rgb(255, 255, 255)');

  const weightBox = await firstRecord.getByLabel('KG').boundingBox();
  const repsBox = await firstRecord.getByLabel('REPS').boundingBox();
  expect(Math.abs((weightBox?.y ?? 0) - (repsBox?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(weightBox?.width).toBeGreaterThan(100);
  expect(repsBox?.width).toBeGreaterThan(100);
});

test('active workout keeps the card wide, compact and vertically usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile workout-deck check');

  const data = createDefaultWorkoutData();
  let setIndex = 0;
  const activeWorkout = buildWorkout(data.dayPlans[4], false, [], {
    now: new Date('2026-10-23T08:30:00.000Z'),
    createId: () => `set-${setIndex++}`,
  });
  const overflowSet = activeWorkout.exercises[1].sets.at(-1)!;
  activeWorkout.exercises[1].sets.push(...Array.from({ length: 4 }, (_, index) => ({
    ...overflowSet,
    id: `overflow-set-${index}`,
  })));
  data.activeWorkout = activeWorkout;

  await page.route('**/api/auth/session', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ user: { email: 'admin@example.com', displayName: 'Syachrul' } }),
  }));
  await page.route('**/api/data', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data, revision: 1, migrated: false, isAdmin: true }),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: 'Resume workout' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upper volume' });
  const card = dialog.locator('.workout-swipe-card');
  const scrollRegion = dialog.locator('.workout-deck-scroll');
  const next = dialog.getByRole('button', { name: 'Next exercise', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Choose current exercise' })).toHaveCount(0);
  await expect(card).toBeVisible();

  const cardBox = await card.boundingBox();
  const nextBox = await next.boundingBox();
  const headerBox = await dialog.locator('.workout-modal-header').boundingBox();
  expect(cardBox?.width).toBeGreaterThanOrEqual(370);
  expect(headerBox?.height).toBeLessThanOrEqual(115);
  expect(nextBox?.width).toBeGreaterThanOrEqual(54);
  expect(nextBox?.height).toBeGreaterThanOrEqual(54);

  await expect(card.getByText('PROGRESSION')).toBeVisible();
  await next.click();
  await expect(card.getByRole('heading', { name: activeWorkout.exercises[1].name })).toBeVisible();

  await scrollRegion.evaluate((element) => { element.scrollTop = 160; });
  await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
