# AutoSend Demo Console

A standalone demo app for the [`@mzedstudio/autosend`](https://www.npmjs.com/package/@mzedstudio/autosend) Convex component.

- Next.js App Router frontend (`src/`)
- Convex backend (`convex/`)
- `@mzedstudio/autosend` component mounted in `convex.config.ts`
- Mail.tm integration for disposable test inboxes

## What the demo shows

1. Create multiple Mail.tm inboxes from the UI.
2. Queue single and bulk emails via `AutoSend` client wrappers.
3. Per-recipient personalization with `{{placeholder}}` interpolation in bulk sends.
4. Process queue batches and inspect retry/sent/failed stats.
5. Inspect lifecycle statuses (`queued`, `sending`, `retrying`, `sent`, `failed`, `canceled`).
6. Read inbound mailbox messages in-app (sync + full message fetch).
7. Manage component config (`testMode`, defaults, sandbox list, provider mode).

## Run

```bash
pnpm install
pnpm dev
```

## Environment

Set required Convex vars before running full send/webhook flow:

```bash
npx convex env set AUTOSEND_API_KEY <api-key>
npx convex env set AUTOSEND_WEBHOOK_SECRET <webhook-secret>
```

Set frontend Convex URL in `.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=<your-convex-url>
```

## Notes

- Mail.tm usage is rate-limited and intended for testing/demo inboxes.
- Mail.tm calls are executed server-side in Convex actions.
- Webhook route remains `/webhooks/autosend` via `registerRoutes`.
- Component source lives at [autosendhq/autosend-convex](https://github.com/autosendhq/autosend-convex).
