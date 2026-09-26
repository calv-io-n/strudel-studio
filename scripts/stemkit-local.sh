#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
stemkit_binary="$project_dir/.local/stemkit/app/opt/StemKit/stemkit"

if [[ ! -x "$stemkit_binary" ]]; then
  echo 'StemKit is not installed in .local/stemkit/app.' >&2
  echo 'See docs/setup.md, "Local StemKit → WAV editor", for installation.' >&2
  exit 1
fi

exec "$stemkit_binary" "$@"
