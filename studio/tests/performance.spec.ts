import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test('selection arms its expression without editing code', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note("c3 e3").s("triangle")';
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const editor = page.locator('.cm-content'); await editor.click(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play into selection', exact: true }).click();
  await expect(page.locator('[data-original]')).toHaveText('note("c3 e3")');
  await expect(page.locator('.performance-destination')).toHaveCount(1);
  await expect(editor).toHaveText(project.tabs[0].code);
  await page.getByRole('button', { name: 'Leave performance' }).click();
  await expect(page.locator('.performance-panel')).toBeHidden();
});
