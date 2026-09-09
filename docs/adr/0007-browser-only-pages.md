# 0007 — Browser-only Studio on static hosting

Status: Accepted
Date: 2026-09-09

## Context and decision

The [Studio design](../design/strudel-studio.md) previously assumed a local Node API, filesystem sample library, ElevenLabs generation, and Python/ALSA MIDI bridge. The user approved replacing that application with a browser-only version deployable to Cloudflare Pages, with direct GitHub sample import and a smaller starter collection.

Replace the application runtime with static Vite output, IndexedDB project/audio storage, Web MIDI hardware access, and browser ZIP backups. Keep existing schema migrations and imported audio identities. Introduce a dedicated hash-route import page and ship exactly Drum Basics, Neon Drive, and six original CC0 drum samples under 1 MB. Retain other examples only as repository source.

This supersedes ADR 0004's Generate tab and server download requirements and ADR 0005's filesystem/ALSA connection transport. Their sample-review, stable-reference, and cross-session connection behavior remains. The [browser deployment target](../design/strudel-studio.md#browser-deployment-target) takes precedence over historical local-server sections.

## Consequences

No backend hosting, API secrets, cloud database, or automatic paid requests. Projects and sounds belong to the browser profile and origin; clearing browser data may erase them. Persistent storage is requested, not guaranteed. Backups are the migration and portability mechanism. Web MIDI and codecs depend on browser support. GitHub import uses public unauthenticated APIs and may encounter rate limits.

Existing local directories are untouched. Users export from the previous release before upgrading and restore into the website. Legacy hardware port mappings may require reconnection/remapping. AI generation and OS loopback are removed.

## Alternatives

Keeping separate Node and Pages versions would duplicate maintenance. A Workers/R2 backend would preserve server features but add storage, identity, and hosting concerns outside this release's scope. The user chose a single browser-only application.

## Validation

Build/typecheck, domain and browser-storage unit tests, and production-static browser tests cover playback, reload, imports, backups, export, MIDI, recording, failures, and starter content. No application API, WebSocket, or third-party sample requests may occur during starter playback.
