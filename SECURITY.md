# Security

Strudel Studio is a static browser application. Projects and samples stay in browser storage; the application has no server API or credential configuration. Pattern code executes JavaScript in the page and can access that origin's data: review code before running it. Imported audio and external URLs retain their own trust and licensing requirements.

Publish only `studio/dist`. Never publish old `.env`, `.studio/`, samples, recordings, or diagnostic attachments containing personal data. Use a separate origin for Studio rather than sharing an origin with applications containing sensitive account data.

## Reporting a vulnerability

If the repository's Security tab offers **Report a vulnerability**, use that private channel. Direct link: https://github.com/calv-io-n/strudel/security/advisories/new.

If private reporting is not enabled, open an issue titled **Private security contact requested** with no vulnerability details, logs, credentials, or reproduction steps. Wait for a maintainer to provide a private channel. This policy does not claim that GitHub private reporting has already been enabled.

Provide affected versions, impact, and a minimal reproduction through the private channel. Never test against someone else's instance without their permission. Rotate exposed credentials immediately; deleting a file or rewriting history alone does not revoke a credential.

## Support

Security fixes target the latest code on `master` and the latest release once published. Older releases are not maintained separately. Response and fix timelines are best effort.
