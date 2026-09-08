import { test, expect, type Page } from '@playwright/test';
import { newProject } from '../shared/model';

async function edit(page: Page, code: string) {
  await page.locator('.tab-editor:not([hidden]) .cm-content').focus();
  await page.keyboard.press('Control+a'); await page.keyboard.insertText(code);
}
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  await page.locator('#edit-name').fill(name);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('Project name')).toHaveValue(name);
  await expect(page.locator('#saved-state')).toHaveText('Session saved');
}
test('sessions autosave to disk and retain identity, code and selection across reloads', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await create(page, 'Persistent jam');
  await edit(page, '$: s("sbd*4").gain(0.31)');
  await expect.poll(async () => (await (await request.get('/api/projects/Persistent-jam')).json()).tabs[0].code).toContain('0.31');
  await page.reload();
  await expect(page.getByLabel('Sessions', { exact: true })).toHaveValue('Persistent-jam');
  await expect(page.locator('.cm-content')).toContainText('0.31');
  await edit(page, '$: s("sbd*4").gain(0.42)');
  // Reload before the debounced network save: the browser draft must recover this edit.
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('0.42');
  await expect.poll(async () => (await (await request.get('/api/projects/Persistent-jam')).json()).tabs[0].code).toContain('0.42');
  await create(page, 'Second jam');
  await edit(page, '$: s("triangle").gain(0.19)');
  await page.getByLabel('Sessions', { exact: true }).selectOption('Persistent-jam');
  await expect(page.locator('.cm-content')).toContainText('0.42');
  await page.getByLabel('Sessions', { exact: true }).selectOption('Second-jam');
  await expect(page.locator('.cm-content')).toContainText('0.19');
  const names = await (await request.get('/api/projects')).json();
  expect(names.filter((name: string) => name.startsWith('Persistent-jam'))).toEqual(['Persistent-jam']);
});

test('failed autosave keeps a recoverable draft and explicit save retries it', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await create(page, 'Retry jam');
  await page.route('**/api/projects/Retry-jam', route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Disk unavailable"}' }) : route.continue());
  await edit(page, '$: s("square").gain(0.17)');
  await expect(page.locator('#saved-state')).toContainText('Not saved');
  await expect(page.getByLabel('Sessions', { exact: true })).toHaveValue('Retry-jam');
  await page.unroute('**/api/projects/Retry-jam');
  await page.locator('.project-menu > summary').click(); await page.locator('#save').click();
  await expect(page.locator('#saved-state')).toHaveText('Session saved');
  expect((await (await request.get('/api/projects/Retry-jam')).json()).tabs[0].code).toContain('0.17');
});

test('Enter creates a session that appears in the dropdown; Cancel and Escape do not', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Keyboard session');
  await page.keyboard.press('Enter');
  const sessions = page.getByLabel('Sessions', { exact: true });
  await expect(sessions).toHaveValue('Keyboard-session');
  await expect(sessions.locator('option[value="Keyboard-session"]')).toHaveText('Keyboard session');
  await expect(page.locator('#saved-state')).toHaveText('Session saved');
  expect((await request.get('/api/projects/Keyboard-session')).ok()).toBe(true);
  await page.reload(); await expect(sessions).toHaveValue('Keyboard-session');
  for (const action of ['click', 'escape']) {
    await page.getByRole('button', { name: 'Add session', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Cancelled session');
    if (action === 'click') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(page.locator('#edit-dialog')).not.toBeVisible();
    await expect(sessions).toHaveValue('Keyboard-session');
  }
  expect((await (await request.get('/api/projects')).json()).includes('Cancelled-session')).toBe(false);
  await create(page, 'Clicked session');
  await expect(sessions.locator('option[value="Clicked-session"]')).toHaveText('Clicked session');
  await sessions.selectOption('Keyboard-session');
  await expect(page.getByLabel('Project name')).toHaveValue('Keyboard session');
});
