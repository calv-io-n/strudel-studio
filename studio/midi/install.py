"""Install the bridge and a reviewed, pinned MIDI MCP in project-local venvs."""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "82be857aabe72059f1265908ac98cf50a977e7f7"
SOURCE = ROOT / ".local/mcp-server-midi"


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


for name in (".venv-midi", ".venv-mcp"):
    if not (ROOT / name / "bin/python").exists():
        run(sys.executable, "-m", "venv", str(ROOT / name))
run(str(ROOT / ".venv-midi/bin/pip"), "install", "-r", "studio/midi/requirements.txt")
if not SOURCE.exists():
    SOURCE.parent.mkdir(exist_ok=True)
    run("git", "clone", "https://github.com/sandst1/mcp-server-midi.git", str(SOURCE))
head = subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True).strip()
if head != COMMIT:
    run("git", "-C", str(SOURCE), "checkout", COMMIT)
run(str(ROOT / ".venv-mcp/bin/pip"), "install", "-r", str(SOURCE / "requirements.txt"))
print("MIDI bridge and MCP installed. MCP client configuration:")
print(json.dumps({"mcpServers": {"strudel-midi": {"command": str(ROOT / ".venv-mcp/bin/python"), "args": [str(ROOT / "studio/midi/mcp_server.py")]}}}, indent=2))
