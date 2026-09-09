import { test, expect, type Page } from '@playwright/test';
import { newProject } from '../shared/model';

async function edit(page: Page, code: string) {
  const editor = page.locator('.tab-editor:not([hidden]) .cm-content');
  await editor.focus(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(code);
  return editor;
}
async function complete(page: Page, prefix: string, query: string, label: string) {
  const editor = await edit(page, prefix);
  await page.keyboard.type(query, { delay: 80 });
  await expect(page.getByRole('option').filter({ hasText: label }).first()).toBeVisible();
  await page.keyboard.press('Tab');
  return editor;
}
test.beforeEach(async ({ request }) => { await request.put('/api/recovery', { data: newProject() }); });

test('IDE completion supports typing, Tab, effects, undo and both themes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  let editor = await complete(page, '$: s("', 'kick', 'Synth kick');
  await expect(editor).toContainText('s("sbd');
  await page.keyboard.press('Control+z'); await expect(editor).toContainText('kick');
  await page.keyboard.press('Escape');
  editor = await complete(page, '$: note("a3").s("triangle").', 'roo', 'Reverb');
  await expect(editor).toContainText('.room(0.3)');
  await page.keyboard.insertText('0.4'); await expect(editor).toContainText('.room(0.4)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await page.locator('.project-menu > summary').click(); await page.locator('#dark-mode').check();
  await page.locator('.project-menu > summary').click();
  await complete(page, '$: s("', 'sawt', 'sawtooth');
  await expect(editor).toContainText('sawtooth');
  await edit(page, '$: s("sbd sawtooth*4")');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Control+Space');
  await expect(page.getByRole('option').filter({ hasText: 'sawtooth' }).first()).toBeVisible();
  await page.screenshot({ path: 'studio/test-results/completion-dark.png' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab'); await expect(editor).toContainText('sbd sawtooth*4');
  await page.keyboard.press('Control+Space');
  await page.keyboard.press('Escape'); await expect(page.getByRole('listbox')).toBeHidden();
  await edit(page, '// a comment'); await page.keyboard.type(' saw');
  await page.keyboard.press('Control+Space'); await expect(page.getByRole('listbox')).toBeHidden();
  await page.keyboard.press('Tab'); await expect(editor).not.toBeFocused();
  await complete(page, '$: s("', 'tri', 'triangle');
  await page.getByRole('button', { name: 'New pattern', exact: true }).click();
  await complete(page, '$: s("', 'sawt', 'sawtooth');
  expect(errors).toEqual([]);
});

test('saved sounds can be labeled, completed and played after reload without previewing', async ({ page, request }) => {
  const response = await request.post('/api/generations', { data: { prompt: 'A short metallic impact', duration: 0.5, loop: false } });
  const job = await response.json();
  await expect.poll(async () => (await (await request.get(`/api/generations/${job.id}`)).json()).state).toBe('complete');
  const { asset } = await (await request.get(`/api/generations/${job.id}`)).json();
  const bad = await request.patch(`/api/samples/${asset.id}`, { data: { label: '' } }); expect(bad.status()).toBe(400);
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('#sounds-toggle').click();
  await page.locator(`[data-asset="${asset.id}"] summary`).click(); await page.locator(`[data-rename-asset="${asset.id}"]`).click();
  await page.locator('#edit-name').fill('Metal impact'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator(`[data-asset="${asset.id}"]`)).toContainText('Metal impact');
  await page.locator('#sounds-close').click();
  const editor = await complete(page, '$: s("', 'Metal', 'Metal impact');
  const key = `studio_${asset.id.replaceAll('-', '')}`;
  await expect(editor).toContainText(key);
  await page.keyboard.insertText('").gain(0.2)');
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).tabs[0].code).toContain(key);
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const audioRequest = page.waitForResponse(`/api/samples/${asset.id}/audio`);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  expect((await audioRequest).ok()).toBe(true);
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('top bar exposes dark mode and creates saved sessions without losing current code', async ({ page, request }) => {
  await request.put('/api/recovery', { data: { ...newProject(), name: 'Header source' } });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(page.locator('.topbar #dark-mode')).toBeVisible();
  await page.locator('#dark-mode').check();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await edit(page, '$: s("sbd*4").gain(0.2)');
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  await page.locator('#edit-name').fill('New jam');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('Sessions', { exact: true })).toHaveValue('New-jam');
  await expect(page.getByLabel('Project name')).toHaveValue('New jam');
  const previous = await (await request.get('/api/projects/Header-source')).json();
  expect(previous.tabs[0].code).toContain('sbd*4');
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  await page.locator('#edit-name').fill('New jam');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('Sessions', { exact: true })).toHaveValue('New-jam-2');
  await page.getByLabel('Sessions', { exact: true }).selectOption('Header-source');
  await expect(page.locator('.cm-content')).toContainText('sbd*4');
  await page.reload();
  await expect(page.locator('#dark-mode')).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#dark-mode')).toBeVisible();
  await expect(page.locator('#add-session')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('completion redraw can remove a focused suggestion without a nested editor update', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await edit(page, '$: s("'); await page.keyboard.type('s', { delay: 80 });
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.evaluate(async moduleUrl => {
    const { EditorView } = await import(moduleUrl);
    const view = EditorView.findFromDOM(document.querySelector('.tab-editor:not([hidden]) .cm-editor'));
    const option = document.querySelector('.cm-tooltip-autocomplete li');
    if (!option || !view) throw new Error('Completion must be open');
    option.setAttribute('tabindex', '-1'); (option as HTMLElement).focus();
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'aw' } });
  }, '/@id/@codemirror/view');
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('saw');
  await page.locator('#project-name').click();
  await expect(page.getByRole('listbox')).toBeHidden();
  expect(errors).toEqual([]);
});

test('selected completions explain parameters in pattern and MIDI editors', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await edit(page, 'note("c3").'); await page.keyboard.type('lpf');
  const docs = page.locator('.studio-function-doc');
  await expect(docs).toContainText('frequency');
  await expect(docs).toContainText('20000');
  await expect(docs).toContainText('Examples');
  await expect(docs).toBeVisible();
  await expect(docs).toBeInViewport();
  await page.screenshot({ path: 'studio/test-results/function-docs.png' });
  await page.keyboard.press('Escape');
  await edit(page, ''); await page.keyboard.type('slider');
  await expect(docs).toContainText('Initial value');
  await expect(docs).toContainText('Minimum value');
  await page.keyboard.press('Escape');
  await page.locator('[data-instrument-tab]').click();
  await edit(page, ''); await page.keyboard.type('MIDI');
  await expect(docs).toContainText('pitch and velocity');
  await page.keyboard.press('Tab');
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toHaveText('MIDI');
});
