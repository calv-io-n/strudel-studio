"""Interactive MCP probe: starts the actual MCP and exercises its tools.

Run while the studio is open. During the pause, connect MCP MIDI Out and learn
CC20 on an inline slider. The probe then sends a sweep and checks receipts.
"""
import asyncio
import json
import os
from pathlib import Path
import sys
import time
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[2]


async def main():
    params = StdioServerParameters(command=str(ROOT / ".venv-mcp/bin/python"), args=[str(ROOT / "studio/midi/mcp_server.py")], env={"STUDIO_PORT": os.getenv("STUDIO_PORT", "5173")})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as client:
            await client.initialize()
            tools = await client.list_tools()
            print("MCP tools:", ", ".join(tool.name for tool in tools.tools), flush=True)
            print(await client.call_tool("list_midi_ports", {}), flush=True)
            if "--list" in sys.argv:
                return
            print("Connect MCP MIDI Out in the studio, select an inline slider, click MIDI Learn, then press Enter here.", flush=True)
            await asyncio.to_thread(input)
            started_at = time.time() * 1000
            await client.call_tool("send_control_change", {"controller": 20, "value": 0, "channel": 0})
            await asyncio.sleep(.3)
            for value in (0, 32, 64, 96, 127):
                await client.call_tool("send_control_change", {"controller": 20, "value": value, "channel": 0})
                await asyncio.sleep(.15)
            # Browser receipts and its periodic snapshot arrive asynchronously.
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                feedback = await client.call_tool("get_studio_feedback", {})
                if feedback.isError:
                    raise RuntimeError(str(feedback.content))
                data = json.loads(next(c.text for c in feedback.content if c.type == "text"))
                events = [e for e in data["events"] if e.get("route") == "alsa" and "MCP MIDI Out" in e.get("source", "") and e.get("receivedAt", 0) >= started_at and e.get("bytes") == [176, 20, 127]]
                sequences = {e["sequence"] for e in events}
                receipts = [r for r in data["receipts"] if r.get("sequence") in sequences and r.get("status") == "applied"]
                snapshot = data.get("snapshot") or {}
                if receipts and snapshot.get("at", 0) >= receipts[-1]["at"]:
                    receipt = receipts[-1]
                    target_id = receipt["target"].get("sliderId")
                    sliders = [s for s in snapshot.get("sliders", []) if s["id"] == target_id and s["value"] == receipt["value"]]
                    if sliders:
                        print(json.dumps({"verified": True, "route": "MCP → ALSA → studio binding → browser slider", "sequence": receipt["sequence"], "slider": sliders[0]}, indent=2), flush=True)
                        return
                await asyncio.sleep(.2)
            raise RuntimeError("MIDI was sent, but a matching ALSA event, applied receipt and fresh slider snapshot were not all observed. Check the MCP input profile and CC20 binding.")


if __name__ == "__main__":
    asyncio.run(main())
