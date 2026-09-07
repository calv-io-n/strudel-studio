"""Local ALSA bridge. stdout is JSONL; diagnostics never masquerade as MIDI."""
import json
import os
import queue
import re
import sys
import threading
import time


def emit(value):
    with output_lock:
        print(json.dumps(value), flush=True)


output_lock = threading.Lock()


def stable_name(name):
    return re.sub(r"\s+\d+:\d+$", "", name)


def main():
    try:
        import rtmidi
        client_name = f"Strudel Virtual Controller {os.getpid()}"
        virtual = rtmidi.MidiOut(rtmidi.API_LINUX_ALSA, client_name)
        virtual.open_virtual_port("Strudel Virtual Out")
        external = rtmidi.MidiIn(rtmidi.API_LINUX_ALSA, "Strudel Studio")
        external.open_virtual_port("Strudel Studio In")
        # Distinct ALSA clients let RtMidi discover and subscribe to our output.
        loopback = rtmidi.MidiIn(rtmidi.API_LINUX_ALSA, "Strudel Loopback")
        out_index = next(i for i, p in enumerate(loopback.get_ports()) if p.startswith(client_name + ":"))
        loopback.open_port(out_index, "Strudel Virtual Return")
    except Exception as exc:
        emit({"type": "status", "ready": False, "message": f"MIDI unavailable: {exc}. Install studio/midi/requirements.txt and check /dev/snd/seq.", "ports": [], "connected": []})
        return 1

    def callback(source):
        def receive(event, _data=None):
            message, _delta = event
            emit({"type": "midi", "source": source, "bytes": message, "receivedAt": time.time() * 1000, "route": "alsa"})
        return receive

    for port, source in ((external, "studio:input"), (loopback, "studio:virtual")):
        port.ignore_types(sysex=True, timing=True, active_sense=True)
        port.set_callback(callback(source))
    commands = queue.Queue()

    def read_stdin():
        for line in sys.stdin:
            try:
                commands.put(json.loads(line))
            except ValueError:
                pass
        commands.put({"type": "quit"})

    threading.Thread(target=read_stdin, daemon=True).start()
    desired, opened = set(), {}
    last_status = None
    refresh_at = 0
    try:
        while True:
            try:
                cmd = commands.get(timeout=0.1)
                if cmd.get("type") == "quit":
                    break
                if cmd.get("type") == "send":
                    data = cmd.get("bytes", [])
                    if len(data) == 3 and all(isinstance(b, int) for b in data) and data[0] & 0xF0 in (0x80, 0x90, 0xB0) and all(0 <= b <= 127 for b in data[1:]):
                        virtual.send_message(data)
                if cmd.get("type") == "connect":
                    desired = set(cmd.get("ports", []))
                    refresh_at = 0
            except queue.Empty:
                pass
            if time.monotonic() < refresh_at:
                continue
            refresh_at = time.monotonic() + 1
            ports = [(i, stable_name(p), p) for i, p in enumerate(loopback.get_ports()) if "Strudel" not in p]
            unique = {name: (i, full) for i, name, full in ports if sum(n == name for _, n, _ in ports) == 1}
            for name in list(opened):
                if name not in desired or name not in unique or opened[name][1] != unique[name][1]:
                    opened.pop(name)[0].close_port()
            errors = []
            for name in desired - opened.keys():
                if name not in unique:
                    errors.append(f"{name}: disconnected or ambiguous")
                    continue
                try:
                    port = rtmidi.MidiIn(rtmidi.API_LINUX_ALSA, "Strudel Hardware")
                    port.open_port(unique[name][0])
                    port.ignore_types(sysex=True, timing=True, active_sense=True)
                    port.set_callback(callback(name))
                    opened[name] = (port, unique[name][1])
                except Exception as exc:
                    errors.append(str(exc))
            status = {"type": "status", "ready": True, "message": "; ".join(errors) or "ALSA virtual loopback connected", "ports": sorted(unique), "connected": sorted(opened)}
            if status != last_status:
                emit(status)
                last_status = status
    finally:
        for port in [virtual, external, loopback] + [p for p, _ in opened.values()]:
            port.close_port()
    return 0


if __name__ == "__main__":
    sys.exit(main())
