import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test('external input capture excludes accompaniment and retains audio after input loss', async ({ page, request }) => {
  const project = newProject(); project.name = 'External input fixture'; project.tabs[0].code = 'note(60).s("triangle").gain(0.5)';
  await request.put('/api/recovery', { data: project });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 880; gain.gain.value = .1; oscillator.connect(gain).connect(destination); oscillator.start(); await context.resume();
      const track = destination.stream.getAudioTracks()[0];
      Object.defineProperty(track, 'getSettings', { value: () => ({ channelCount: 2, deviceId: 'fixture-input' }) });
      (window as unknown as { fixtureInput: MediaStreamTrack }).fixtureInput = track;
      return destination.stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'audioinput', deviceId: 'fixture-input', label: 'Fixture audio interface', groupId: 'fixture', toJSON: () => ({}) } as MediaDeviceInfo];
  });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await page.getByRole('button', { name: 'Record audio', exact: true }).click();
  await page.getByRole('button', { name: 'Record audio take', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('Recording');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const track = (window as unknown as { fixtureInput: MediaStreamTrack }).fixtureInput; track.stop(); track.dispatchEvent(new Event('ended')); });
  await expect(page.locator('[data-status]')).toContainText('incomplete take retained');
  await expect(page.locator('#transport-state')).toContainText('Playing');
  const saving = page.waitForResponse('/api/recordings'); await page.getByRole('button', { name: 'Save sound', exact: true }).click();
  const response = await saving; expect(response.ok()).toBe(true); const asset = await response.json();
  expect(asset.recording.source).toBe('external'); expect(asset.recording.incomplete).toBe(true);
  const wav = await (await request.get(`/api/samples/${asset.id}/audio`)).body();
  let peak = 0, crossings = 0, previous = 0;
  for (let i = 44; i < wav.length; i += 4) { const sample = wav.readInt16LE(i); peak = Math.max(peak, Math.abs(sample)); if (previous < 0 && sample >= 0) crossings++; previous = sample; }
  expect(peak).toBeGreaterThan(2000); expect(peak).toBeLessThan(4000);
  expect(crossings / asset.duration).toBeGreaterThan(800);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});
