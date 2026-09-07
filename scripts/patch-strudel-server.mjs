// Patches node_modules/strudel-server/src/main.ts to use the current
// strudel.cc DOM selectors. Upstream hardcodes `#code .cm-...`, but
// strudel.cc removed `#code` and now wraps the editor in `.code-container`.
//
// This script is idempotent — safe to run repeatedly. It runs during `npm run setup:watcher`
// and is a no-op if either the upstream file is missing or already patched.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve("node_modules/strudel-server/src/main.ts");

if (!existsSync(target)) {
  // Either strudel-server isn't installed yet (totally fine — postinstall on a
  // partial install) OR upstream restructured its layout (broken watcher).
  // We can't tell from here which it is, so warn but don't fail.
  if (existsSync("node_modules/strudel-server")) {
    console.warn(
      "[patch-strudel-server] WARN: node_modules/strudel-server exists but " +
        "src/main.ts is missing. Upstream may have restructured. The watcher " +
        "will likely fail to start.",
    );
  }
  process.exit(0);
}

const before = readFileSync(target, "utf8");
const after = before.replaceAll("#code .cm-", ".code-container .cm-").replaceAll(
  'document.querySelector("#code")',
  'document.querySelector(".code-container")',
).replaceAll(
  'page.click("#code',
  'page.click(".code-container',
);

if (after === before) {
  console.log("[patch-strudel-server] already patched (or no #code selectors found).");
  process.exit(0);
}

writeFileSync(target, after);
console.log("[patch-strudel-server] patched #code -> .code-container in strudel-server/src/main.ts");
