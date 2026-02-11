# AutoSend Component Example

This example shows how to install and call `@mzedstudio/autosend` from a Convex app.

## Environment

Set these values in Convex:

```bash
npx convex env set AUTOSEND_API_KEY <api-key>
npx convex env set AUTOSEND_WEBHOOK_SECRET <webhook-secret>
```

## Webhook

Mount the default webhook route in `convex/http.ts`:

- Path: `/webhooks/autosend`
- Required headers:
  - `x-webhook-signature`
  - `x-webhook-event`
  - `x-webhook-delivery-id`
  - `x-webhook-timestamp`
