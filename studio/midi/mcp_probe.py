"""Interactive MCP probe: starts the actual MCP and exercises its tools.

Run while the studio is open. During the pause, connect MCP MIDI Out and learn
CC20 on an inline slider. The probe then sends a sweep and checks receipts.
"""
import asyncio
import json
from pathlib import Path
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[2]


async def main():
    params = StdioServerParameters(command=str(ROOT / ".venv-mcp/bin/python"), args=[str(ROOT / "studio/midi/mcp_server.py")])
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
            await client.call_tool("send_control_change", {"controller": 20, "value": 0, "channel": 0})
            await asyncio.sleep(.3)
            for value in (0, 32, 64, 96, 127):
                await client.call_tool("send_control_change", {"controller": 20, "value": value, "channel": 0})
                await asyncio.sleep(.15)
            feedback = await client.call_tool("get_studio_feedback", {})
            print(feedback.model_dump_json(indent=2), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
