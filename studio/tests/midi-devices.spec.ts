import { test, expect, type WebSocketRoute } from '@playwright/test';
import { newProject } from '../shared/model';
import { openController } from './helpers/controller';

const port = 'Fixture keyboard:MIDI';
test('external input survives song switches, browser close and reconnect; controller has its own menu', async ({ page, context, request }) => {
  await request.post('/api/midi/connections', { data: { port, connected: false } });
  const first = await (await request.post('/api/projects', { data: { ...newProject(), name: 'MIDI device first' } })).json();
  const second = await (await request.post('/api/projects', { data: { ...newProject(), name: 'MIDI device second' } })).json();
  await request.put('/api/recovery', { data: first });
  let channel: WebSocketRoute;
  await page.route('**/api/status', async route => {
    const response = await route.fetch(); const status = await response.json();
    await route.fulfill({ json: { ...status, bridge: { ready: true, message: '', ports: [port], connected: status.midiConnections } } });
  });
  await page.routeWebSocket('**/api/midi', ws => {
    channel = ws;
    const server = ws.connectToServer();
    server.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type === 'status') return;
      ws.send(raw);
      if (message.type === 'midi-connections') ws.send(JSON.stringify({ type: 'status', ready: true, message: '', ports: [port], connected: message.ports }));
    });
  });
  try {
    await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
    await page.getByRole('button', { name: 'MIDI devices', exact: true }).click();
    await expect(page.locator('#devices-content')).toBeVisible();
    await expect(page.locator('#controls')).toBeHidden();
    await expect(page.getByLabel('MIDI route')).toBeHidden();
    await page.getByLabel('Available MIDI inputs').selectOption(port);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('.device-connection')).toContainText('Connected');
    await page.getByLabel('Sessions').selectOption(second.sessionId);
    await expect(page.getByLabel('Project name')).toHaveValue(second.name);
    await page.getByRole('button', { name: 'MIDI devices', exact: true }).click();
    await expect(page.locator('.device-connection')).toContainText('Connected');
    // Hardware input still reaches a new song that had no device profile when saved.
    channel!.send(JSON.stringify({ type: 'midi', source: port, route: 'alsa', sequence: 501, receivedAt: Date.now(), bytes: [144, 64, 100] }));
    await expect(page.locator('#device-activity')).toContainText('Note 64');
    await expect.poll(async () => (await (await request.get('/api/feedback')).json()).snapshot?.diagnostics.notes).toBe(1);
    channel!.send(JSON.stringify({ type: 'midi', source: port, route: 'alsa', sequence: 502, receivedAt: Date.now(), bytes: [128, 64, 0] }));
    await expect.poll(async () => (await (await request.get('/api/feedback')).json()).snapshot?.diagnostics.notes).toBe(0);
    channel!.send(JSON.stringify({ type: 'status', ready: true, message: '', ports: [], connected: [] }));
    await expect(page.locator('.device-connection')).toContainText('Waiting for device');
    channel!.send(JSON.stringify({ type: 'status', ready: true, message: '', ports: [port], connected: [port] }));
    await expect(page.locator('.device-connection')).toContainText('Connected');
    await page.reload(); await expect(page.locator('.device-connection')).toContainText('Connected');
    const other = await context.newPage(); await other.goto('/'); await expect(other.locator('#connection')).toHaveText('Studio connected'); await other.close();
    // An old client's session subscription must not clear application-level connections either.
    await page.evaluate(async () => { const ws = new WebSocket(`ws://${location.host}/api/midi`); await new Promise<void>(resolve => { ws.onopen = () => { ws.send(JSON.stringify({ type: 'connect', ports: [] })); ws.close(); }; ws.onclose = () => resolve(); }); });
    expect((await (await request.get('/api/midi/connections')).json()).ports).toEqual([port]);
    await openController(page); await expect(page.getByRole('slider', { name: 'Knob 1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'MIDI devices', exact: true }).click();
    await page.getByRole('button', { name: `Disconnect ${port}`, exact: true }).click();
    await expect(page.locator('.device-connection')).toHaveCount(0);
    await page.reload(); expect((await (await request.get('/api/midi/connections')).json()).ports).toEqual([]);
  } finally { await request.post('/api/midi/connections', { data: { port, connected: false } }); }
});
