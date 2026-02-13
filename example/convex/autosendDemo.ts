import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { autosend } from "./email";

const attachmentValidator = v.object({
  filename: v.string(),
  content: v.optional(v.string()),
  fileUrl: v.optional(v.string()),
  contentType: v.optional(v.string()),
  disposition: v.optional(v.string()),
  description: v.optional(v.string()),
});

const emailRecipientValidator = v.object({
  email: v.string(),
  name: v.optional(v.string()),
});

async function ensureDemoEmail(
  ctx: any,
  params: {
    emailId: string;
    recipient: string;
    subject?: string;
    mode: "single" | "bulk";
    createdAt: number;
  },
) {
  const existing = await ctx.db
    .query("demoEmails")
    .withIndex("by_emailId", (q: any) => q.eq("emailId", params.emailId))
    .unique();

  if (!existing) {
    await ctx.db.insert("demoEmails", params);
  }
}

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    return await autosend.getConfig(ctx);
  },
});

export const setConfig = mutation({
  args: {
    testMode: v.optional(v.boolean()),
    defaultFrom: v.optional(v.string()),
    defaultReplyTo: v.optional(v.string()),
    sandboxTo: v.optional(v.array(v.string())),
    rateLimitRps: v.optional(v.number()),
    retryDelaysMs: v.optional(v.array(v.number())),
    maxAttempts: v.optional(v.number()),
    sendBatchSize: v.optional(v.number()),
    cleanupBatchSize: v.optional(v.number()),
    providerCompatibilityMode: v.optional(v.union(v.literal("strict"), v.literal("lenient"))),
    autosendBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await autosend.setConfig(ctx, {
      config: {
        testMode: args.testMode,
        defaultFrom: args.defaultFrom,
        defaultReplyTo: args.defaultReplyTo,
        sandboxTo: args.sandboxTo,
        rateLimitRps: args.rateLimitRps,
        retryDelaysMs: args.retryDelaysMs,
        maxAttempts: args.maxAttempts,
        sendBatchSize: args.sendBatchSize,
        cleanupBatchSize: args.cleanupBatchSize,
        providerCompatibilityMode: args.providerCompatibilityMode,
        autosendBaseUrl: args.autosendBaseUrl,
      },
    });
  },
});

export const sendEmail = mutation({
  args: {
    to: v.string(),
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
  },
  handler: async (ctx, args) => {
    const result = await autosend.sendEmail(ctx, {
      to: [args.to],
      toName: args.toName,
      from: args.from,
      fromName: args.fromName,
      replyTo: args.replyTo,
      replyToName: args.replyToName,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      html: args.html,
      text: args.text,
      templateId: args.templateId,
      dynamicData: args.dynamicData,
      attachments: args.attachments,
      metadata: args.metadata,
      idempotencyKey: args.idempotencyKey,
      unsubscribeGroupId: args.unsubscribeGroupId,
    });

    await ensureDemoEmail(ctx, {
      emailId: result.emailId,
      recipient: args.to,
      subject: args.subject,
      mode: "single",
      createdAt: Date.now(),
    });

    return result;
  },
});

export const sendBulk = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const recipients = Array.from(
      new Set(args.recipients.map((value) => value.trim()).filter(Boolean)),
    );

    const result = await autosend.sendBulk(ctx, {
      recipients,
      from: args.from,
      fromName: args.fromName,
      replyTo: args.replyTo,
      replyToName: args.replyToName,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      html: args.html,
      text: args.text,
      templateId: args.templateId,
      dynamicData: args.dynamicData,
      attachments: args.attachments,
      metadata: args.metadata,
      idempotencyKeyPrefix: args.idempotencyKeyPrefix,
      unsubscribeGroupId: args.unsubscribeGroupId,
    });

    for (let index = 0; index < result.emailIds.length; index += 1) {
      const emailId = result.emailIds[index]!;
      const recipient = recipients[index] ?? recipients[0] ?? "unknown";
      await ensureDemoEmail(ctx, {
        emailId,
        recipient,
        subject: args.subject,
        mode: "bulk",
        createdAt: Date.now(),
      });
    }

    return result;
  },
});

export const listDemoEmails = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);

    const entries = await ctx.db
      .query("demoEmails")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);

    const statuses = await autosend.statusBatch(ctx, {
      emailIds: entries.map((e) => e.emailId),
    });

    return entries.map((entry, i) => ({
      ...entry,
      status: statuses[i] ?? null,
    }));
  },
});

export const getStatus = query({
  args: {
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    return await autosend.status(ctx, { emailId: args.emailId });
  },
});

export const listEmailEvents = query({
  args: {
    emailId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await autosend.listEvents(ctx, {
      emailId: args.emailId,
      limit: args.limit,
    });
  },
});

export const cancelEmail = mutation({
  args: {
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    return await autosend.cancelEmail(ctx, { emailId: args.emailId });
  },
});

export const processQueue = action({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await autosend.processQueue(ctx, { batchSize: args.batchSize });
  },
});

export const cleanupOldEmails = action({
  args: {
    olderThanMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await autosend.cleanupOldEmails(ctx, args);
  },
});

export const cleanupAbandonedEmails = action({
  args: {
    staleAfterMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await autosend.cleanupAbandonedEmails(ctx, args);
  },
});

export const executeCleanupOld = action({
  args: {
    olderThanMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await autosend.cleanupOldEmails(ctx, {
      ...args,
      dryRun: false,
    });
  },
});

export const executeCleanupAbandoned = action({
  args: {
    staleAfterMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await autosend.cleanupAbandonedEmails(ctx, {
      ...args,
      dryRun: false,
    });
  },
});

export const cleanupOldDeliveries = action({
  args: {
    olderThanMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await autosend.cleanupOldDeliveries(ctx, args);
  },
});
