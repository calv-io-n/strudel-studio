# 0008 — Browser catalogue, continuous input, and precision-preserving render

Status: Accepted
Date: 2026-09-09

## Context

[The browser target](../design/strudel-studio.md#browser-deployment-target) previously seeded six drum samples, used IndexedDB alone, and exported fixed 44.1 kHz/16-bit WAV. External recording did not provide a persistent effects instrument. The Browser-first Studio epic requests opt-in acquisition, processed GoXLR input, and high-quality full-song export on static Pages hosting.

## Decision

Keep one browser-only application, as agreed for the remaining epic work. Do not restore a local application server. Use IndexedDB metadata with OPFS audio and IndexedDB fallback. Seed only synth-only Neon Drive; install the original kit explicitly through the existing library drawer. Preserve imports and provide a separate provenance-based dry-run utility for legacy filesystem caches.

Add one track-routed AUDIO input with literal scalars/sliders, the existing draft/Apply workflow, and Web Audio continuous effects. Capture dry editable or wet frozen takes; retain a dry original for wet takes. Save timing with audio-clock offsets and portable asset IDs.

Keep source originals and float32 working audio. Add 16/24-bit PCM and float32 WAV encoding in workers. Freeze render code/control/audio snapshots and require an explicit draft/applied choice when they differ. Reject missing dependencies and uncaptured live input unless explicitly excluded. Bound memory, duration, and event counts before scheduling.

## Consequences and validation

No Worker, proxy, token, cloud storage, or separate deployment is required. Browser storage remains origin-specific and needs portable backups. Arbitrary patterned AUDIO modifiers and multiple simultaneous hardware inputs are outside this implementation. Actual GoXLR channel exposure and latency require hardware validation.

Unit tests cover precision, schema/storage compatibility, concurrency, archive bounds, and cleanup scope. Static Chromium tests cover opt-in installation, imports/backups, OPFS fallback, capture, frozen-take rendering, and absence of backend dependencies. Production deployment remains a separate release action.
