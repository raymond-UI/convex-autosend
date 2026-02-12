# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@mzedstudio/autosend` is a Convex Component for transactional email delivery via the AutoSend provider. It provides queue-based email sending with retries, idempotency, webhook verification, and lifecycle tracking.

## Commands

```bash
npm run dev              # Run everything (backend + frontend + build watcher) in parallel
npm run dev:backend      # Convex dev server with component typechecking
npm run dev:frontend     # Next.js example app on port 3000
npm run build            # TypeScript compile to dist/
npm run build:codegen    # Convex codegen + TypeScript build (required after schema/API changes)
npm run build:clean      # Full clean rebuild (rm dist + codegen + build)
npm test                 # Run all tests (vitest)
npm run test:watch       # Vitest in watch mode
npm run typecheck        # Type check without emitting
```

Tests use `convex-test` with the edge-runtime environment. Test files live in `tests/` and are run with vitest. Tests mock `globalThis.fetch` to simulate provider responses.

## Architecture

This is a **Convex Component** — a reusable package that consumers install and mount in their Convex app. It has two layers:

### Component Layer (`src/component/`)

The backend that runs inside Convex. Defined as `defineComponent("autosend_component")` in `convex.config.ts`.

- **schema.ts** — 4 tables: `emails` (queue + state machine), `emailEvents` (webhook event log), `webhookDeliveries` (dedup), `globals` (config singleton)
- **emails.ts** — `sendEmail`/`sendBulk` mutations enqueue emails; internal mutations handle claim/success/failure transitions
- **queueInternal.ts** — `processDueQueue` action fetches due emails, sends via provider, applies retry schedule
- **provider.ts** — HTTP calls to AutoSend API (`/v1/mails/send`, `/v1/mails/bulk`); handles response parsing, retry detection (429/5xx), test mode recipient rewriting
- **webhooks.ts** — HMAC-SHA256 signature verification, timestamp validation, delivery deduplication, event-to-status mapping
- **config.ts** — Global configuration via `globals` table singleton; merge vs replace semantics
- **cleanup.ts** — Maintenance: remove old terminal emails, recover stale "sending" state
- **types.ts** — All validators and TypeScript types; email status enum: `queued → retrying → sending → sent → failed → canceled`

### Client Layer (`src/client/index.ts`)

The public API consumers import. Exports:
- `AutoSend` class — wraps component API calls (`sendEmail`, `sendBulk`, `status`, `processQueue`, `handleCallback`, etc.)
- `registerRoutes()` — sets up HTTP webhook endpoint (default path: `/webhooks/autosend`)
- Type exports and validators for consumer use

### Key Design Patterns

- **Queue-first**: `sendEmail`/`sendBulk` only write to the database. Actual sending happens when `processQueue` runs (via cron or manual trigger).
- **Deterministic idempotency**: SHA-256 hash of normalized payload, or explicit `idempotencyKey`.
- **State machine**: Emails progress through statuses with atomic transitions via internal mutations.
- **Internal vs public functions**: Cross-function calls use `internalMutation`/`internalAction`; consumer-facing functions use `mutation`/`query`/`action`.

### Example App (`example/`)

Next.js App Router demo showing component integration:
- `example/convex/convex.config.ts` — mounts component with `app.use(autosend, { name: "autosend" })`
- `example/convex/email.ts` — creates `AutoSend` wrapper instance
- `example/convex/http.ts` — registers webhook routes
- `example/convex/crons.ts` — scheduled queue processing
- `example/convex/mailtm.ts` — Mail.tm integration for disposable test inboxes

## Build & TypeScript Setup

- ESM-only (`"type": "module"` in package.json)
- Three tsconfig files: `tsconfig.json` (base), `tsconfig.build.json` (excludes tests), `tsconfig.test.json` (NodeNext module resolution for vitest)
- `convex.json` points functions to `example/convex` (the example app backend)
- After changing component schema or public API, run `npm run build:codegen` to regenerate types

## Testing Patterns

Tests in `tests/autosend.test.ts` use `convexTest(schema, modules)` directly with component schema and module glob. They mock `globalThis.fetch` to control provider responses and restore it in `afterEach`. Component functions are called as `t.mutation("emails:sendEmail", {...})` (module:function format).

## Environment Variables

For the example app, set via `npx convex env set`:
- `AUTOSEND_API_KEY` — AutoSend API bearer token
- `AUTOSEND_WEBHOOK_SECRET` — HMAC webhook signing secret
- `NEXT_PUBLIC_CONVEX_URL` — in `example/.env.local`
