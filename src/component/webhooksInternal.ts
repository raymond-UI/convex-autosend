import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const recordWebhookDelivery = internalMutation({
  args: {
    deliveryId: v.string(),
    eventType: v.string(),
    receivedAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_deliveryId", (q) => q.eq("deliveryId", args.deliveryId))
      .unique();

    if (existing) return false;

    await ctx.db.insert("webhookDeliveries", {
      deliveryId: args.deliveryId,
      eventType: args.eventType,
      receivedAt: args.receivedAt,
    });

    return true;
  },
});

export const storeEventAndApply = internalMutation({
  args: {
    emailId: v.string(),
    eventType: v.string(),
    payload: v.any(),
    providerMessageId: v.optional(v.string()),
    occurredAt: v.number(),
    receivedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("emailEvents", {
      emailId: args.emailId,
      eventType: args.eventType,
      payload: args.payload,
      providerMessageId: args.providerMessageId,
      occurredAt: args.occurredAt,
      receivedAt: args.receivedAt,
    });

    let email =
      args.emailId === "unknown"
        ? null
        : await ctx.db
            .query("emails")
            .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
            .unique();

    if (!email && args.providerMessageId) {
      email = await ctx.db
        .query("emails")
        .withIndex("by_providerMessageId", (q) =>
          q.eq("providerMessageId", args.providerMessageId!),
        )
        .unique();
    }

    if (!email) return null;

    const patch: Record<string, unknown> = {
      providerStatus: args.eventType,
      updatedAt: args.receivedAt,
    };

    if (args.providerMessageId && !email.providerMessageId) {
      patch.providerMessageId = args.providerMessageId;
    }

    // Canceled emails are a terminal state — record the provider event for
    // observability (providerStatus + providerMessageId) but never change status.
    if (email.status === "canceled") {
      await ctx.db.patch(email._id, patch as any);
      return null;
    }

    if (args.eventType === "email.sent" || args.eventType === "email.delivered") {
      if (email.status === "queued" || email.status === "retrying" || email.status === "sending") {
        patch.status = "sent";
      }
      if (!email.sentAt) {
        patch.sentAt = args.occurredAt;
      }
    } else if (args.eventType === "email.deferred") {
      // keep current status, only providerStatus update
    } else if (
      args.eventType === "email.bounced" ||
      args.eventType === "email.spam_reported"
    ) {
      if (email.status !== "failed") {
        patch.status = "failed";
        patch.failedAt = args.occurredAt;
        patch.lastError = `Webhook event: ${args.eventType}`;
      }
    }

    await ctx.db.patch(email._id, patch as any);
    return null;
  },
});
