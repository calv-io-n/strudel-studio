// Explicit opt-in setup for the legacy editor → strudel.cc watcher.
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? `${command} exited ${result.status}`);
    process.exit(result.status || 1);
  }
}
const bun = spawnSync('bun', ['--version'], { encoding: 'utf8' });
if (bun.error || bun.status !== 0) {
  console.error('The optional watcher needs Bun 1.2+. Install it from https://bun.sh, then rerun npm run setup:watcher. Studio itself does not need Bun.');
  process.exit(1);
}
const [major, minor] = bun.stdout.trim().split('.').map(Number);
if (!Number.isFinite(major) || major < 1 || (major === 1 && minor < 2)) {
  console.error('The optional watcher requires Bun 1.2 or newer.'); process.exit(1);
}
run(process.execPath, ['scripts/patch-strudel-server.mjs']);
run(process.execPath, ['node_modules/playwright/cli.js', 'install', 'chromium']);
console.log('Watcher ready. Run npm run dev:watcher.');
