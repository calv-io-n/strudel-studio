// Optional legacy-tool diagnostics; run explicitly with npm run ensure-deps.
// This script is never run automatically during installation.
// Checks the tools used by the legacy workspace:
//
//   1. Bun is on PATH                — strudel-server's bin is a .ts file run by bun
//   2. Playwright Chromium is cached — strudel-server drives it via Playwright
//   3. ffmpeg is on PATH             — used by rec/chop/trim/norm/yt scripts
//   4. yt-dlp is on PATH             — used by `npm run yt` to pull samples from YouTube
//
// All checks are idempotent and cheap on repeat runs:
//   - the binary checks are `which`
//   - `playwright install chromium` short-circuits when the matching version is cached
//
// This diagnostic exits successfully even if a tool is missing. It prints a warning
// with a copy-paste install command, then we exit 0. Reasons:
//   * a fresh clone might be set up before the user installs system tools
//   * CI / offline environments may want to provide tools some other way
//   * ffmpeg/yt-dlp are only needed for specific scripts; npm run dev works without them
//
// Skip the chromium step with: STRUDEL_SKIP_PLAYWRIGHT_INSTALL=1

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ANSI = {
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function check(label, fn) {
  process.stdout.write(`[ensure-deps] ${label}... `);
  try {
    const result = fn();
    console.log(result || "ok");
  } catch (err) {
    console.log(ANSI.yellow(`warn: ${err.message}`));
  }
}

function checkBinary(label, bin, args, installHint) {
  check(label, () => {
    const r = spawnSync(bin, args, { encoding: "utf8" });
    if (r.error || r.status !== 0) {
      throw new Error(
        `${bin} not found.\n  Install: ${ANSI.cyan(installHint)}`,
      );
    }
    return (r.stdout || r.stderr || "").trim().split("\n")[0].slice(0, 80);
  });
}

// 1. Bun (required by `npm run watch`)
checkBinary(
  "bun",
  "bun",
  ["--version"],
  "curl -fsSL https://bun.sh/install | bash",
);

// 2. Playwright Chromium (required by `npm run watch`)
if (process.env.STRUDEL_SKIP_PLAYWRIGHT_INSTALL === "1") {
  console.log(`[ensure-deps] skipping playwright install (STRUDEL_SKIP_PLAYWRIGHT_INSTALL=1)`);
} else {
  check("playwright chromium", () => {
    if (!existsSync("node_modules/.bin/playwright")) {
      throw new Error("node_modules/.bin/playwright missing — was strudel-server installed?");
    }
    const r = spawnSync(
      "node_modules/.bin/playwright",
      ["install", "chromium"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (r.error) throw new Error(r.error.message);
    if (r.status !== 0) {
      throw new Error(`playwright install exited ${r.status}: ${(r.stderr || "").trim().slice(0, 200)}`);
    }
    // Playwright is silent (or prints "BEWARE" warnings only) when the
    // pinned chromium version is already cached. It prints download progress
    // and a final "downloaded to <path>" line otherwise.
    const out = (r.stdout || "") + (r.stderr || "");
    if (/downloaded to|Downloading/.test(out)) return "downloaded";
    return "already installed";
  });
}

// 3. ffmpeg (required by rec / chop / trim / norm / yt)
checkBinary(
  "ffmpeg",
  "ffmpeg",
  ["-version"],
  "sudo apt install ffmpeg   (or pacman -S ffmpeg / dnf install ffmpeg)",
);

// 4. yt-dlp (required by `npm run yt`)
checkBinary(
  "yt-dlp",
  "yt-dlp",
  ["--version"],
  "sudo apt install yt-dlp   (or pipx install yt-dlp / pip install --user yt-dlp)",
);
