# @mzedstudio/autosend

A [Convex component](https://docs.convex.dev/components) for transactional email delivery on top of AutoSend, including queueing, retries, idempotency, webhook verification, and delivery lifecycle tracking.

## Features

- Queue-first sending: `sendEmail` and `sendBulk` enqueue email jobs instead of sending inline.
- Deterministic idempotency: duplicate requests resolve to the same `emailId`.
- Retry handling: retryable failures (network, `429`, `5xx`) are retried with configurable backoff.
- Delivery lifecycle: full status model (`queued`, `sending`, `retrying`, `sent`, `failed`, `canceled`).
- Webhook security: HMAC SHA-256 signature validation and timestamp skew protection.
- Webhook dedupe: duplicate callback deliveries are ignored by `deliveryId`.
- Status/event persistence: stores webhook events and provider identifiers.
- Safe config reads: `getConfig` never returns secret values.
- Test sandbox mode: optional recipient rewriting via `sandboxTo`.
- Maintenance actions: cleanup for old terminal emails and abandoned sending jobs.

## Installation

```bash
npm install @mzedstudio/autosend convex
```

## Setup

### 1. Register the component

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import autosend from "@mzedstudio/autosend/convex.config.js";

const app = defineApp();
app.use(autosend, { name: "autosend" });
export default app;
```

### 2. Create a client wrapper

```ts
// convex/email.ts
import { AutoSend } from "@mzedstudio/autosend";
import { components } from "./_generated/api";

export const autosend = new AutoSend(components.autosend);
```

### 3. Configure secrets and runtime settings

Set your environment values in Convex:

```bash
npx convex env set AUTOSEND_API_KEY <api-key>
npx convex env set AUTOSEND_WEBHOOK_SECRET <webhook-secret>
```

Then persist component config:

```ts
// convex/admin.ts
import { mutation } from "./_generated/server";
import { autosend } from "./email";

export const configureAutosend = mutation({
  args: {},
  handler: async (ctx) => {
    await autosend.setConfig(ctx, {
      config: {
        autosendApiKey: "replace-with-your-key",
        webhookSecret: "replace-with-your-webhook-secret",
        defaultFrom: "noreply@example.com",
        testMode: true,
        sandboxTo: ["sandbox@example.com"],
      },
    });
  },
});
```

### 4. Mount webhook route

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@mzedstudio/autosend";
import { components } from "./_generated/api";

const http = httpRouter();
registerRoutes(http, components.autosend);
export default http;
```

Default webhook path: `/webhooks/autosend`.

## Usage

### Send and process queue

```ts
import { action, mutation } from "./_generated/server";
import { autosend } from "./email";

export const sendWelcome = mutation({
  args: {},
  handler: async (ctx) => {
    return await autosend.sendEmail(ctx, {
      to: ["user@example.com"],
      subject: "Welcome",
      html: "<p>Hello</p>",
    });
  },
});

export const processEmailQueue = action({
  args: {},
  handler: async (ctx) => {
    return await autosend.processQueue(ctx);
  },
});
```

Important: `sendEmail` and `sendBulk` enqueue only. Trigger `processQueue` from an action/cron worker.

### Bulk send

```ts
await autosend.sendBulk(ctx, {
  recipients: ["a@example.com", "b@example.com"],
  subject: "Update",
  html: "<p>News</p>",
});
```

### Status and cancel

```ts
const status = await autosend.status(ctx, { emailId });
const canceled = await autosend.cancelEmail(ctx, { emailId });
```

### Cleanup

```ts
await autosend.cleanupOldEmails(ctx, { olderThanMs: 7 * 24 * 60 * 60 * 1000 });
await autosend.cleanupAbandonedEmails(ctx, { staleAfterMs: 15 * 60 * 1000 });
```

## API Reference

### `AutoSend` class

| Method | Context | Returns | Notes |
|---|---|---|---|
| `sendEmail(ctx, args)` | mutation | `{ emailId, deduped }` | Enqueues one email |
| `sendBulk(ctx, args)` | mutation | `{ emailIds, acceptedCount }` | Enqueues up to 100 recipients |
| `status(ctx, { emailId })` | query | `EmailDoc \| null` | Reads current email state |
| `cancelEmail(ctx, { emailId })` | mutation | `{ canceled }` | Allowed only from `queued` or `retrying` |
| `setConfig(ctx, { config, replace? })` | mutation | `{ created }` | Merge by default, full replace when `replace: true` |
| `getConfig(ctx)` | query | safe config object | Includes `hasApiKey`/`hasWebhookSecret` only |
| `processQueue(ctx, { batchSize? })` | action | queue metrics | Sends due queued/retrying emails |
| `cleanupOldEmails(ctx, args)` | action | `{ deletedCount, emailIds, hasMore }` | Removes old terminal emails |
| `cleanupAbandonedEmails(ctx, args)` | action | `{ recoveredCount, failedCount, emailIds, hasMore }` | Recovers/finishes stale `sending` jobs |
| `handleCallback(ctx, args)` | action | `{ ok, eventType, ... }` | Verifies and applies webhook callback |

### `registerRoutes(http, component, options?)`

Mounts webhook route handling:

- Default path: `/webhooks/autosend`
- Optional override: `options.path`
- Optional secret override: `options.webhookSecret`

Required headers:

- `x-webhook-signature`
- `x-webhook-event`
- `x-webhook-delivery-id`
- `x-webhook-timestamp`

## Config Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `autosendApiKey` | `string` | unset | Bearer token for AutoSend API |
| `webhookSecret` | `string` | unset | HMAC secret for webhook verification |
| `testMode` | `boolean` | `true` | Rewrites recipients to `sandboxTo` |
| `defaultFrom` | `string` | unset | Fallback sender |
| `defaultReplyTo` | `string` | unset | Fallback reply-to |
| `sandboxTo` | `string[]` | `[]` | Target recipients used in test mode |
| `rateLimitRps` | `number` | `2` | Max sends per queue run |
| `retryDelaysMs` | `number[]` | `[5000,10000,20000]` | Retry delay schedule |
| `maxAttempts` | `number` | `4` | Total attempts including first try |
| `sendBatchSize` | `number` | `25` | Max queue items selected per run |
| `cleanupBatchSize` | `number` | `100` | Max items per cleanup batch |
| `providerCompatibilityMode` | `"strict" \| "lenient"` | `"strict"` | Response parsing strictness for provider variance |
| `autosendBaseUrl` | `string` | `https://api.autosend.com` | Base URL for provider API |

`getConfig` returns only safe values plus booleans:

- `hasApiKey`
- `hasWebhookSecret`

## Email Lifecycle

### Statuses

- `queued`: accepted and waiting to be claimed by processor.
- `sending`: currently claimed by queue processor.
- `retrying`: previous attempt failed and next retry is scheduled.
- `sent`: successfully accepted by provider.
- `failed`: terminal failure (retries exhausted or non-retryable).
- `canceled`: canceled before send.

### Retry policy

- Retries on network failures, HTTP `429`, and HTTP `5xx`.
- Default delays: `5000`, `10000`, `20000` ms.
- Default `maxAttempts`: `4` total attempts.

## Webhook Behavior

- Signature: HMAC SHA-256 over raw body.
- Timestamp skew limit: 5 minutes.
- Dedupe key: `deliveryId`.
- All callback payloads are recorded to `emailEvents`.

Event mapping:

| Event type | Effect |
|---|---|
| `email.sent`, `email.delivered` | Mark/keep as sent, update provider status |
| `email.deferred` | Provider status update only |
| `email.bounced`, `email.spam_reported` | Mark failed if not already terminal |
| `email.opened`, `email.clicked`, `email.unsubscribed` | Event recorded, provider status update only |

## Direct Component Functions

If you do not use the `AutoSend` wrapper, the component exposes:

- `config.setConfig`
- `config.getConfig`
- `emails.sendEmail`
- `emails.sendBulk`
- `emails.cancelEmail`
- `queries.status`
- `queue.processQueue`
- `cleanup.cleanupOldEmails`
- `cleanup.cleanupAbandonedEmails`
- `webhooks.handleCallback`

## Testing

Use `@mzedstudio/autosend/test` with `convex-test`:

```ts
import { convexTest } from "convex-test";
import { register } from "@mzedstudio/autosend/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const t = convexTest(schema, modules);
register(t, "autosend");
```

## License

Apache-2.0
