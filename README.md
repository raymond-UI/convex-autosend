# @mzedstudio/autosend

A [Convex component](https://docs.convex.dev/components) for transactional email delivery on top of AutoSend, including queueing, retries, idempotency, webhook verification, and delivery lifecycle tracking.

## Features

- Queue-first sending: `sendEmail` and `sendBulk` enqueue email jobs instead of sending inline.
- Deterministic idempotency: duplicate requests resolve to the same `emailId`.
- Retry handling: retryable failures (network, `429`, `5xx`) are retried with configurable backoff.
- Delivery lifecycle: full status model (`queued`, `sending`, `retrying`, `sent`, `failed`, `canceled`).
- CC/BCC and recipient names: supports `cc`, `bcc`, `toName`, `fromName`, and `replyToName`.
- Attachments: inline base64 content or URL-referenced file attachments.
- Templates: send via `templateId` with `dynamicData` for dynamic content.
- Unsubscribe groups: optional `unsubscribeGroupId` for suppression list management.
- Webhook security: HMAC SHA-256 signature validation and timestamp skew protection.
- Webhook dedupe: duplicate callback deliveries are ignored by `deliveryId`.
- Status/event persistence: stores webhook events and provider identifiers.
- Batch status queries: fetch status for multiple emails in a single call via `statusBatch`.
- Event listing: query webhook events per email via `listEvents`.
- Safe config reads: `getConfig` returns all non-secret config values (never exposes API key or webhook secret).
- Test sandbox mode: optional recipient rewriting via `sandboxTo`.
- Maintenance actions: cleanup for old terminal emails, abandoned sending jobs, and stale webhook delivery records. Supports dry-run preview before executing.

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
      toName: "Jane Doe",
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

### CC, BCC, and attachments

```ts
await autosend.sendEmail(ctx, {
  to: ["user@example.com"],
  cc: [{ email: "team@example.com", name: "Team" }],
  bcc: [{ email: "archive@example.com" }],
  subject: "Report",
  html: "<p>See attached.</p>",
  attachments: [
    { filename: "report.pdf", fileUrl: "https://example.com/report.pdf" },
    { filename: "data.csv", content: "base64-encoded-content", contentType: "text/csv" },
  ],
  unsubscribeGroupId: "marketing",
});
```

### Templates

```ts
await autosend.sendEmail(ctx, {
  to: ["user@example.com"],
  templateId: "welcome-template-id",
  dynamicData: { firstName: "Jane", plan: "Pro" },
});
```

### Status, batch status, and events

```ts
// Single email status
const email = await autosend.status(ctx, { emailId });

// Batch status for multiple emails
const statuses = await autosend.statusBatch(ctx, {
  emailIds: [emailId1, emailId2, emailId3],
});

// List webhook events for an email
const events = await autosend.listEvents(ctx, { emailId, limit: 20 });

// Cancel a queued or retrying email
const { canceled } = await autosend.cancelEmail(ctx, { emailId });
```

### Cleanup

```ts
// Dry-run preview (no deletions)
const preview = await autosend.cleanupOldEmails(ctx, { dryRun: true });

// Delete old terminal emails (default: older than 7 days)
await autosend.cleanupOldEmails(ctx, { olderThanMs: 7 * 24 * 60 * 60 * 1000 });

// Recover abandoned sending jobs (default: stale after 15 min)
await autosend.cleanupAbandonedEmails(ctx, { staleAfterMs: 15 * 60 * 1000 });

// Prune old webhook delivery records (default: older than 7 days)
await autosend.cleanupOldDeliveries(ctx, { olderThanMs: 7 * 24 * 60 * 60 * 1000 });
```

## API Reference

### `AutoSend` class

| Method | Context | Returns | Notes |
|---|---|---|---|
| `sendEmail(ctx, args)` | mutation | `{ emailId, deduped }` | Enqueues one email (single recipient) |
| `sendBulk(ctx, args)` | mutation | `{ emailIds, acceptedCount }` | Enqueues up to 100 recipients |
| `status(ctx, { emailId })` | query | `EmailDoc \| null` | Reads current email state |
| `statusBatch(ctx, { emailIds })` | query | `(EmailDoc \| null)[]` | Batch status for multiple emails |
| `listEvents(ctx, { emailId, limit? })` | query | `EmailEvent[]` | Webhook events for an email (newest first, default limit 50, max 200) |
| `cancelEmail(ctx, { emailId })` | mutation | `{ canceled }` | Allowed only from `queued` or `retrying` |
| `setConfig(ctx, { config, replace? })` | mutation | `{ created }` | Merge by default, full replace when `replace: true` |
| `getConfig(ctx)` | query | `SafeConfig` | All non-secret config plus `hasApiKey`/`hasWebhookSecret` booleans |
| `processQueue(ctx, { batchSize? })` | action | `{ processedCount, sentCount, retriedCount, failedCount, hasMoreDue }` | Sends due queued/retrying emails |
| `cleanupOldEmails(ctx, args)` | action | `{ deletedCount, emailIds, hasMore }` | Removes old terminal emails. Supports `dryRun` |
| `cleanupAbandonedEmails(ctx, args)` | action | `{ recoveredCount, failedCount, emailIds, hasMore }` | Recovers stale `sending` jobs. Supports `dryRun` |
| `cleanupOldDeliveries(ctx, args)` | action | `{ deletedCount, hasMore }` | Removes old webhook delivery dedup records |
| `handleCallback(ctx, args)` | action | `{ ok, eventType, emailId?, duplicate?, error? }` | Verifies and applies webhook callback |

### `sendEmail` arguments

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | `string[]` | yes | Must contain exactly one recipient |
| `toName` | `string` | no | Display name for the recipient |
| `from` | `string` | no | Sender address (falls back to `defaultFrom` in config) |
| `fromName` | `string` | no | Display name for the sender |
| `replyTo` | `string` | no | Reply-to address (falls back to `defaultReplyTo` in config) |
| `replyToName` | `string` | no | Display name for reply-to |
| `cc` | `{ email, name? }[]` | no | Carbon copy recipients |
| `bcc` | `{ email, name? }[]` | no | Blind carbon copy recipients |
| `subject` | `string` | conditional | Required unless `templateId` is provided |
| `html` | `string` | conditional | HTML body; required unless `templateId` or `text` is provided |
| `text` | `string` | conditional | Plain text body |
| `templateId` | `string` | no | Provider template identifier |
| `dynamicData` | `any` | no | Template variables/merge fields |
| `attachments` | `Attachment[]` | no | File attachments (see below) |
| `metadata` | `any` | no | Arbitrary metadata stored with the email |
| `idempotencyKey` | `string` | no | Explicit dedup key (auto-generated from payload if omitted) |
| `unsubscribeGroupId` | `string` | no | Suppression group identifier |

### `sendBulk` arguments

Same as `sendEmail` except:
- `recipients: string[]` replaces `to` (up to 100 recipients)
- `idempotencyKeyPrefix: string` replaces `idempotencyKey`
- No `toName` (one email per recipient)

### `Attachment` format

| Field | Type | Required | Notes |
|---|---|---|---|
| `filename` | `string` | yes | Name of the attached file |
| `content` | `string` | conditional | Base64-encoded content (provide `content` or `fileUrl`, not both) |
| `fileUrl` | `string` | conditional | URL to fetch the file from |
| `contentType` | `string` | no | MIME type (e.g., `application/pdf`) |
| `disposition` | `string` | no | `attachment` or `inline` |
| `description` | `string` | no | File description |

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
| `defaultFrom` | `string` | unset | Fallback sender address |
| `defaultReplyTo` | `string` | unset | Fallback reply-to address |
| `sandboxTo` | `string[]` | `[]` | Target recipients used in test mode |
| `rateLimitRps` | `number` | `2` | Max sends per queue run |
| `retryDelaysMs` | `number[]` | `[5000,10000,20000]` | Retry delay schedule (ms) |
| `maxAttempts` | `number` | `4` | Total attempts including first try |
| `sendBatchSize` | `number` | `25` | Max queue items selected per run |
| `cleanupBatchSize` | `number` | `100` | Max items per cleanup batch |
| `cleanupOldEmailsMs` | `number` | `604800000` (7 days) | Age threshold for deleting terminal emails |
| `cleanupAbandonedMs` | `number` | `900000` (15 min) | Stale threshold for recovering abandoned `sending` jobs |
| `cleanupDeliveriesMs` | `number` | `604800000` (7 days) | Age threshold for pruning webhook delivery records |
| `providerCompatibilityMode` | `"strict" \| "lenient"` | `"strict"` | Response parsing strictness for provider variance |
| `autosendBaseUrl` | `string` | `https://api.autosend.com` | Base URL for provider API |

### `getConfig` return value

`getConfig` returns a `SafeConfig` object containing all non-secret configuration values plus two booleans indicating whether secrets are set:

- All fields above except `autosendApiKey` and `webhookSecret`
- `hasApiKey: boolean` — whether `autosendApiKey` is configured
- `hasWebhookSecret: boolean` — whether `webhookSecret` is configured

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
- Timestamp skew limit: 2 minutes.
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
- `queries.statusBatch`
- `queries.listEvents`
- `queue.processQueue`
- `cleanup.cleanupOldEmails`
- `cleanup.cleanupAbandonedEmails`
- `cleanup.cleanupOldDeliveries`
- `webhooks.handleCallback`

## Exported Types and Validators

The package exports TypeScript types and Convex validators for use in your own functions:

```ts
import type {
  EmailStatus,           // "queued" | "retrying" | "sending" | "sent" | "failed" | "canceled"
  SendEmailArgs,         // Arguments for sendEmail
  SendBulkArgs,          // Arguments for sendBulk
  EmailRecipient,        // { email: string; name?: string }
  Attachment,            // Attachment object shape
  ConfigUpdate,          // Fields accepted by setConfig
  SafeConfig,            // Return type of getConfig
  DeliveryCleanupResult, // Return type of cleanupOldDeliveries
  ProviderCompatibilityMode, // "strict" | "lenient"
} from "@mzedstudio/autosend";

// Convex validators (for use in your own function args/returns)
import {
  emailStatusValidator,
  sendEmailArgsValidator,
  sendBulkArgsValidator,
  sendResultValidator,
  sendBulkResultValidator,
  cancelResultValidator,
  processQueueResultValidator,
  cleanupResultValidator,
  abandonedCleanupResultValidator,
  deliveryCleanupResultValidator,
  attachmentValidator,
  emailRecipientValidator,
  configUpdateValidator,
  safeConfigValidator,
  webhookHandleResultValidator,
  providerCompatibilityModeValidator,
} from "@mzedstudio/autosend";
```

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
