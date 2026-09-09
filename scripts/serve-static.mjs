// Test server: static artifacts and the same response headers published to Pages.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('studio/dist'), rules = [];
let rule;
for (const line of (await readFile(resolve(root, '_headers'), 'utf8')).split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { rule = { path: line.trim(), headers: {} }; rules.push(rule); }
  else { const at = line.indexOf(':'); if (at > 0) rule.headers[line.slice(0, at).trim()] = line.slice(at + 1).trim(); }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.wasm': 'application/wasm' };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!target.startsWith(root + sep) || !['GET', 'HEAD'].includes(req.method) || ! (await stat(target)).isFile()) throw new Error('Not found');
    for (const rule of rules) if (rule.path === path || rule.path.endsWith('*') && path.startsWith(rule.path.slice(0, -1))) for (const [name, value] of Object.entries(rule.headers)) res.setHeader(name, value);
    res.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : await readFile(target));
  } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(5185, '127.0.0.1', () => console.log('Static Studio verification: http://127.0.0.1:5185'));
