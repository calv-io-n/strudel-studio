import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test('Sounds defaults to Import and retains unfinished generation across tabs', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Import', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Generate', exact: true }).click();
  await page.getByLabel('Describe your next sound').fill('Warm brass');
  await page.getByRole('tab', { name: 'Import', exact: true }).click();
  await page.getByRole('tab', { name: 'Generate', exact: true }).click();
  await expect(page.getByLabel('Describe your next sound')).toHaveValue('Warm brass');
  await expect(page.getByLabel('Search sounds')).toBeVisible();
});
