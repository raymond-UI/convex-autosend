import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  attachmentValidator,
  emailRecipientValidator,
  emailStatusValidator,
  providerCompatibilityModeValidator,
} from "./types";

export default defineSchema({
  emails: defineTable({
    emailId: v.string(),
    idempotencyKey: v.string(),
    status: emailStatusValidator,
    to: v.array(v.string()),
    toName: v.optional(v.string()),
    from: v.string(),
    fromName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
    replyToName: v.optional(v.string()),
    cc: v.optional(v.array(emailRecipientValidator)),
    bcc: v.optional(v.array(emailRecipientValidator)),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    templateId: v.optional(v.string()),
    dynamicData: v.optional(v.any()),
    attachments: v.optional(v.array(attachmentValidator)),
    metadata: v.optional(v.any()),
    unsubscribeGroupId: v.optional(v.string()),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextAttemptAt: v.number(),
    lastAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    queuedAt: v.number(),
    sentAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_emailId", ["emailId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_providerMessageId", ["providerMessageId"])
    .index("by_updatedAt", ["updatedAt"]),

  emailEvents: defineTable({
    emailId: v.string(),
    eventType: v.string(),
    payload: v.any(),
    providerMessageId: v.optional(v.string()),
    occurredAt: v.number(),
    receivedAt: v.number(),
  }).index("by_emailId_occurredAt", ["emailId", "occurredAt"]),

  webhookDeliveries: defineTable({
    deliveryId: v.string(),
    eventType: v.string(),
    receivedAt: v.number(),
  }).index("by_deliveryId", ["deliveryId"]),

  globals: defineTable({
    singleton: v.literal("globals"),
    autosendApiKey: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    testMode: v.optional(v.boolean()),
    defaultFrom: v.optional(v.string()),
    defaultReplyTo: v.optional(v.string()),
    sandboxTo: v.optional(v.array(v.string())),
    rateLimitRps: v.optional(v.number()),
    retryDelaysMs: v.optional(v.array(v.number())),
    maxAttempts: v.optional(v.number()),
    sendBatchSize: v.optional(v.number()),
    cleanupBatchSize: v.optional(v.number()),
    providerCompatibilityMode: v.optional(providerCompatibilityModeValidator),
    autosendBaseUrl: v.optional(v.string()),
  }).index("by_singleton", ["singleton"]),
});
