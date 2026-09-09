import { MidiPresets } from './midi-presets';
import { backupProject, restoreBackup } from './backup';
import { discoverGitHub, downloadGitHub } from './github';
import { importSample } from './imports';
import { parseLibraries, syncLibraries } from './libraries';
import { saveRecording } from './recordings';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import { GenerationSchema, PROJECT_FORMAT, parseProject } from '../shared/model';
import { parseMidi } from '../shared/midi';
import { Store } from './store';
import { Generator } from './generation';
import { MidiBridge } from './bridge';
import { MidiConnections } from './midi-connections';

const root = fileURLToPath(new URL('../../', import.meta.url));
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* Key is optional until generation. */ }
const port = Number(process.env.STUDIO_PORT || 5173);
const store = new Store(process.env.STUDIO_DATA_DIR || path.join(root, '.studio/projects'), process.env.STUDIO_SAMPLE_DIR || path.join(root, 'samples/ai'), process.env.STUDIO_LIBRARY_DIR || path.join(root, 'samples/libraries'));
await store.init();
const midiPresets = new MidiPresets(path.join(store.root, '.settings', 'midi-presets'));
const generator = new Generator(store, process.env.ELEVENLABS_API_KEY, process.env.STUDIO_FIXTURE_GENERATION === '1');
const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const events: object[] = [], receipts: object[] = [];
let studioSnapshot: object | null = null;
function publish(event: object) {
  events.push(event); if (events.length > 200) events.shift();
  for (const client of sockets.clients) if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event));
}
const bridge = new MidiBridge(root, publish, process.env.STUDIO_DISABLE_MIDI === '1');
const midiConnections = new MidiConnections(path.join(store.root, '.settings'), ports => {
  bridge.connect(ports);
  publish({ type: 'midi-connections', ports });
});
// Import explicitly enabled hardware choices once. Later session loads never change subscriptions.
const legacyPorts = new Set<string>();
for (const name of await store.projects()) {
  try { for (const profile of (await store.load(name)).profiles) if (profile.enabled && !profile.port.startsWith('studio:')) legacyPorts.add(profile.port); }
  catch { /* Ignore unrelated or invalid project files during the one-time migration. */ }
}
await midiConnections.init([...legacyPorts]);
const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Expected application/json');
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 2_000_000) throw new Error('Request too large'); }
  return JSON.parse(text);
}
function localRequest(req: IncomingMessage) {
  if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(req.headers.host || '')) return false;
  return !req.headers.origin || [`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin);
}
const server = createServer(async (req, res) => {
  if (!localRequest(req)) return json(res, 403, { error: 'Local studio requests only.' });
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  if (!url.pathname.startsWith('/api/')) return vite.middlewares(req, res);
  try {
    if (req.method === 'POST' && url.pathname === '/api/imports/github/discover') return json(res, 200, await discoverGitHub(await body(req)));
    if (req.method === 'GET' && url.pathname === '/api/imports/github/audio') { const bytes = await downloadGitHub(Object.fromEntries(url.searchParams)); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); return res.end(bytes); }
    if (req.method === 'POST' && url.pathname === '/api/imports/sample') return json(res, 201, await importSample(req, store));
    if (req.method === 'POST' && url.pathname === '/api/recordings') return json(res, 201, await saveRecording(req, store));
    if (req.method === 'POST' && url.pathname === '/api/backups') { const bytes = await backupProject(parseProject(await body(req)), store); res.writeHead(200, { 'Content-Type': 'application/zip' }); return res.end(bytes); }
    if (req.method === 'POST' && url.pathname === '/api/backups/restore') { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 260_000_000) throw new Error('Backup exceeds 256 MB.'); chunks.push(chunk); } return json(res, 201, await restoreBackup(Buffer.concat(chunks), store)); }
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { bridge: bridge.status, midiConnections: midiConnections.ports, generation: { configured: generator.configured, fixture: generator.fixture }, format: PROJECT_FORMAT });
    if (url.pathname === '/api/midi/presets' && req.method === 'GET') return json(res, 200, await midiPresets.list());
    if (url.pathname === '/api/midi/presets' && req.method === 'POST') return json(res, 201, await midiPresets.save(await body(req)));
    if (url.pathname === '/api/midi/connections' && req.method === 'GET') return json(res, 200, { ports: midiConnections.ports });
    if (url.pathname === '/api/midi/connections' && req.method === 'POST') return json(res, 200, await midiConnections.update(await body(req)));
    if (req.method === 'GET' && url.pathname === '/api/feedback') return json(res, 200, { events, receipts, snapshot: studioSnapshot });
    if (req.method === 'GET' && url.pathname === '/api/samples') return json(res, 200, await store.assets());
    const packMatch = url.pathname.match(/^\/api\/packs\/([\da-f-]{36})$/i);
    if (req.method === 'PATCH' && packMatch) return json(res, 200, await store.labelPack(packMatch[1], z.object({ name: z.string().trim().min(1).max(80) }).parse(await body(req)).name));
    const metadataMatch = url.pathname.match(/^\/api\/samples\/([\da-f-]{36})$/i);
    if (req.method === 'PATCH' && metadataMatch) {
      const metadata = z.object({ label: z.string().trim().min(1).max(80).optional(), description: z.string().max(1000).optional(), tags: z.array(z.string().trim().min(1).max(50)).max(20).optional() }).strict().parse(await body(req));
      return json(res, 200, await store.updateAsset(metadataMatch[1], metadata));
    }
    const sampleMatch = url.pathname.match(/^\/api\/samples\/([\da-f-]{36})\/audio$/i);
    if (req.method === 'GET' && sampleMatch) {
      const asset = await store.asset(sampleMatch[1]);
      const audio = await readFile(await store.audioPath(asset));
      res.writeHead(200, { 'Content-Type': asset.format === 'wav' ? 'audio/wav' : 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'public, max-age=31536000, immutable' });
      return res.end(audio);
    }
    if (req.method === 'POST' && url.pathname === '/api/generations') return json(res, 202, generator.start(GenerationSchema.parse(await body(req))));
    const jobMatch = url.pathname.match(/^\/api\/generations\/([\da-f-]{36})$/i);
    if (req.method === 'GET' && jobMatch) {
      const job = generator.jobs.get(jobMatch[1]);
      return json(res, job ? 200 : 404, job ?? { error: 'Generation not found.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, await store.projects());
    if (req.method === 'POST' && url.pathname === '/api/projects') return json(res, 201, await store.create(await body(req)));
    if (url.pathname === '/api/recovery') {
      if (req.method === 'PUT') return json(res, 200, await store.save('recovery', await body(req)));
      if (req.method === 'GET') {
        try { return json(res, 200, await store.load('recovery')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return json(res, 200, null); throw error; }
      }
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
    if (projectMatch && req.method === 'GET') return json(res, 200, await store.load(projectMatch[1]));
    if (projectMatch && req.method === 'PUT') return json(res, 200, await store.save(projectMatch[1], parseProject(await body(req))));
    if (url.pathname === '/api/midi/reconnect' && req.method === 'POST') { bridge.start(); return json(res, 200, bridge.status); }
    if (url.pathname === '/api/midi/send' && req.method === 'POST') {
      const data = z.object({ bytes: z.array(z.number().int()).length(3) }).parse(await body(req));
      bridge.send(data.bytes); return json(res, 202, { status: 'sent', verified: false });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return json(res, code === 'ENOENT' ? 404 : 400, { error: error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : 'Request failed' });
  }
});
const vite = await createViteServer({ configFile: path.join(root, 'studio/vite.config.ts'), server: { middlewareMode: true, hmr: { server }, fs: { strict: true, allow: [path.join(root, 'studio/client'), path.join(root, 'studio/shared'), path.join(root, 'node_modules')] } }, appType: 'spa' });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/api/midi') return;
  if (!localRequest(req)) return socket.destroy();
  sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws));
});
sockets.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'midi-connections', ports: midiConnections.ports }));
  ws.send(JSON.stringify({ type: 'status', ...bridge.status }));
  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'connect') {
        // Older open pages send their song's profiles here. Ignore those obsolete subscriptions.
      } else if (message.type === 'send' && parseMidi(message.bytes)) {
        if (message.simulate === true) bridge.receive({ source: 'studio:virtual', bytes: message.bytes, receivedAt: Date.now(), route: 'simulation' });
        else bridge.send(message.bytes);
      } else if (message.type === 'receipt') {
        const receipt = z.object({ sequence: z.number(), bindingId: z.string(), status: z.string().max(200), value: z.number().optional(), at: z.number(), target: z.unknown() }).parse(message);
        receipts.push(receipt); if (receipts.length > 200) receipts.shift();
      } else if (message.type === 'snapshot') {
        studioSnapshot = { diagnostics: message.diagnostics, sliders: message.sliders, slots: message.slots, at: Date.now() };
      }
    } catch (error) { ws.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Invalid MIDI request' })); }
  });
});
bridge.start();
server.listen(port, '127.0.0.1', () => {
  console.log(`Strudel Studio: http://127.0.0.1:${port}`);
  const libraries = parseLibraries(process.env.STUDIO_LIBRARIES);
  if (libraries.length) void syncLibraries(libraries, store, { publish }).catch(error => console.error(`Library sync failed: ${(error as Error).message}`));
});
async function shutdown() { bridge.close(); for (const ws of sockets.clients) ws.close(); sockets.close(); await vite.close(); server.close(); }
process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());
