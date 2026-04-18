"use node";

import { action } from "./_generated/server";
import { autosend } from "./email";

export const syncSecretsFromEnv = action({
  args: {},
  handler: async (ctx) => {
    const autosendApiKey = process.env.AUTOSEND_API_KEY;
    const webhookSecret = process.env.AUTOSEND_WEBHOOK_SECRET;

    if (!autosendApiKey && !webhookSecret) {
      throw new Error(
        "No AUTOSEND_API_KEY or AUTOSEND_WEBHOOK_SECRET found in Convex env.",
      );
    }

    await autosend.setConfig(ctx, {
      config: {
        autosendApiKey: autosendApiKey || undefined,
        webhookSecret: webhookSecret || undefined,
        testMode: true,
        defaultFrom: "ray@con.taskos.dev",
        defaultReplyTo: "ray@con.taskos.dev",
      },
    });

    return {
      hasApiKey: Boolean(autosendApiKey),
      hasWebhookSecret: Boolean(webhookSecret),
      syncedAt: Date.now(),
    };
  },
});
