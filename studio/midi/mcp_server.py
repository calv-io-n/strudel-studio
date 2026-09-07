"""Stdio adapter for the pinned sandst1 MIDI MCP, plus studio readback.

The upstream tools remain the independent MIDI source. Feedback is reported by
the studio browser after handling the OS-delivered event, not inferred on send.
"""
import builtins
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".local/mcp-server-midi/mcp_midi_server.py"
if not SOURCE.exists():
    raise SystemExit("Run python3 studio/midi/install.py first.")

# Upstream prints diagnostics on import and in tool handlers. Keep stdout clean
# for MCP JSON-RPC without modifying the installed upstream source.
with contextlib.redirect_stdout(sys.stderr):
    spec = importlib.util.spec_from_file_location("upstream_midi_mcp", SOURCE)
    upstream = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(upstream)
    except Exception as exc:
        raise SystemExit(f"MIDI MCP requires ALSA access (/dev/snd/seq): {exc}")
upstream.print = lambda *args, **kwargs: builtins.print(*args, **{**kwargs, "file": sys.stderr})


@upstream.mcp.tool()
def list_midi_ports():
    """List ALSA inputs/outputs. Connect MCP MIDI Out in the studio device panel."""
    import rtmidi
    reader = rtmidi.MidiIn(name="Studio MCP Inspector")
    writer = rtmidi.MidiOut(name="Studio MCP Inspector Out")
    try:
        return {"inputs": reader.get_ports(), "outputs": writer.get_ports()}
    finally:
        reader.close_port()
        writer.close_port()


@upstream.mcp.tool()
def get_studio_feedback():
    """Read received MIDI events, binding receipts, and the latest browser state.

    A send result alone is NOT verified. Match receipt.sequence to the received
    ALSA event sequence and check snapshot.at for a fresh browser observation.
    """
    port = int(os.getenv("STUDIO_PORT", "5173"))
    with urlopen(f"http://127.0.0.1:{port}/api/feedback", timeout=5) as response:
        return json.load(response)


if __name__ == "__main__":
    try:
        upstream.mcp.run(transport="stdio")
    finally:
        upstream.midiout.close_port()
