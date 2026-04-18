# AutoSend Mission Control Example

This example mirrors the `llm-cache` demo stack:

- Next.js App Router frontend (`example/src`)
- Convex backend (`example/convex`)
- `@mzedstudio/autosend` component mounted in `convex.config.ts`
- Mail.tm integration for disposable test inboxes

## What the demo shows

1. Create multiple Mail.tm inboxes from the UI.
2. Queue single and bulk emails via `AutoSend` client wrappers.
3. Process queue batches and inspect retry/sent/failed stats.
4. Inspect lifecycle statuses (`queued`, `sending`, `retrying`, `sent`, `failed`, `canceled`).
5. Read inbound mailbox messages in-app (sync + full message fetch).
6. Manage component config (`testMode`, defaults, sandbox list, provider mode).

## Run

From package root (`/autosend`):

```bash
npm install
npm run dev
```

- Convex backend: `convex dev --typecheck-components`
- Next frontend: `cd example && npx next dev --port 3000`

## Environment

Set required Convex vars before running full send/webhook flow:

```bash
npx convex env set AUTOSEND_API_KEY <api-key>
npx convex env set AUTOSEND_WEBHOOK_SECRET <webhook-secret>
```

Set frontend Convex URL in `example/.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=<your-convex-url>
```

## Notes

- Mail.tm usage is rate-limited and intended for testing/demo inboxes.
- Mail.tm calls are executed server-side in Convex actions.
- Webhook route remains `/webhooks/autosend` via `registerRoutes`.
