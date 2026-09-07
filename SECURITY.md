# Security

Strudel Studio is a local, single-user application. Run it bound to localhost. It is not designed to be exposed through a public reverse proxy or shared between untrusted users. Pattern code executes JavaScript in the browser: review code before running it. Optional watcher tools automate a browser; imported audio and external sample URLs have their own trust and licensing requirements.

Keep `.env`, `.studio/`, generated sounds, recordings, and local tool environments private. An API key belongs only in the server environment. Do not include credentials or personal session files in issues or diagnostic attachments.

## Reporting a vulnerability

If the repository's Security tab offers **Report a vulnerability**, use that private channel. Direct link: https://github.com/calv-io-n/strudel/security/advisories/new.

If private reporting is not enabled, open an issue titled **Private security contact requested** with no vulnerability details, logs, credentials, or reproduction steps. Wait for a maintainer to provide a private channel. This policy does not claim that GitHub private reporting has already been enabled.

Provide affected versions, impact, and a minimal reproduction through the private channel. Never test against someone else's instance without their permission. Rotate exposed credentials immediately; deleting a file or rewriting history alone does not revoke a credential.

## Support

Security fixes target the latest code on `master` and the latest release once published. Older releases are not maintained separately. Response and fix timelines are best effort.
