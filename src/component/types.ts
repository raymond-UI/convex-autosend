import { v, type Infer } from "convex/values";

export const emailStatusValidator = v.union(
  v.literal("queued"),
  v.literal("retrying"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("canceled"),
);

export type EmailStatus = Infer<typeof emailStatusValidator>;

export const providerCompatibilityModeValidator = v.union(
  v.literal("strict"),
  v.literal("lenient"),
);

export type ProviderCompatibilityMode = Infer<
  typeof providerCompatibilityModeValidator
>;

export const emailRecipientValidator = v.object({
  email: v.string(),
  name: v.optional(v.string()),
});

export type EmailRecipient = Infer<typeof emailRecipientValidator>;

export const attachmentValidator = v.object({
  filename: v.string(),
  content: v.optional(v.string()),
  fileUrl: v.optional(v.string()),
  contentType: v.optional(v.string()),
  disposition: v.optional(v.string()),
  description: v.optional(v.string()),
});

export type Attachment = Infer<typeof attachmentValidator>;

export const sendEmailArgsValidator = v.object({
  to: v.array(v.string()),
  toName: v.optional(v.string()),
  from: v.optional(v.string()),
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
  idempotencyKey: v.optional(v.string()),
  unsubscribeGroupId: v.optional(v.string()),
});

export type SendEmailArgs = Infer<typeof sendEmailArgsValidator>;

export const sendBulkArgsValidator = v.object({
  recipients: v.array(v.string()),
  from: v.optional(v.string()),
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
  idempotencyKeyPrefix: v.optional(v.string()),
  unsubscribeGroupId: v.optional(v.string()),
});

export type SendBulkArgs = Infer<typeof sendBulkArgsValidator>;

export const configUpdateValidator = v.object({
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
});

export type ConfigUpdate = Infer<typeof configUpdateValidator>;

export const safeConfigValidator = v.object({
  testMode: v.boolean(),
  defaultFrom: v.optional(v.string()),
  defaultReplyTo: v.optional(v.string()),
  sandboxTo: v.array(v.string()),
  rateLimitRps: v.number(),
  retryDelaysMs: v.array(v.number()),
  maxAttempts: v.number(),
  sendBatchSize: v.number(),
  cleanupBatchSize: v.number(),
  providerCompatibilityMode: providerCompatibilityModeValidator,
  autosendBaseUrl: v.string(),
  hasApiKey: v.boolean(),
  hasWebhookSecret: v.boolean(),
});

export type SafeConfig = Infer<typeof safeConfigValidator>;

export const emailDocValidator = v.object({
  _id: v.id("emails"),
  _creationTime: v.number(),
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
});

export type EmailDoc = Infer<typeof emailDocValidator>;

export const sendResultValidator = v.object({
  emailId: v.string(),
  deduped: v.boolean(),
});
export type SendResult = Infer<typeof sendResultValidator>;

export const sendBulkResultValidator = v.object({
  emailIds: v.array(v.string()),
  acceptedCount: v.number(),
});
export type SendBulkResult = Infer<typeof sendBulkResultValidator>;

export const cancelResultValidator = v.object({
  canceled: v.boolean(),
});
export type CancelResult = Infer<typeof cancelResultValidator>;

export const processQueueResultValidator = v.object({
  processedCount: v.number(),
  sentCount: v.number(),
  retriedCount: v.number(),
  failedCount: v.number(),
  hasMoreDue: v.boolean(),
});
export type ProcessQueueResult = Infer<typeof processQueueResultValidator>;

export const webhookHandleResultValidator = v.object({
  ok: v.boolean(),
  eventType: v.string(),
  emailId: v.optional(v.string()),
  duplicate: v.optional(v.boolean()),
  error: v.optional(v.string()),
});
export type WebhookHandleResult = Infer<typeof webhookHandleResultValidator>;

export const cleanupResultValidator = v.object({
  deletedCount: v.number(),
  emailIds: v.array(v.string()),
  hasMore: v.boolean(),
});
export type CleanupResult = Infer<typeof cleanupResultValidator>;

export const abandonedCleanupResultValidator = v.object({
  recoveredCount: v.number(),
  failedCount: v.number(),
  emailIds: v.array(v.string()),
  hasMore: v.boolean(),
});
export type AbandonedCleanupResult = Infer<typeof abandonedCleanupResultValidator>;

export const TERMINAL_STATUSES: EmailStatus[] = ["sent", "failed", "canceled"];
