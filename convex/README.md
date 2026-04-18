# Convex Example Backend

This folder hosts the Convex app backing the AutoSend Mission Control demo.

## Files

- `convex.config.ts`: mounts `@mzedstudio/autosend` as `components.autosend`
- `http.ts`: registers webhook route with `registerRoutes`
- `autosendDemo.ts`: queue/config/status/cleanup wrappers around the component client
- `mailtm.ts`: Mail.tm inbox creation + sync + message fetch APIs
- `schema.ts`: local tables for demo email tracking and inbox/message persistence

## Local tables

- `demoEmails`: tracked outbound email IDs shown in UI
- `mailtmInboxes`: disposable inbox credentials/tokens
- `mailtmMessages`: synced inbox message summaries/details
