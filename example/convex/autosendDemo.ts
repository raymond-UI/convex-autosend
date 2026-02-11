import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { autosend } from "./email";

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
    providerCompatibilityMode: v.optional(v.union(v.literal("strict"), v.literal("lenient"))),
    autosendBaseUrl: v.optional(v.string()),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await autosend.setConfig(ctx, {
      config: {
        autosendApiKey: args.autosendApiKey,
        webhookSecret: args.webhookSecret,
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
      replace: args.replace,
    });
  },
});

export const sendEmail = mutation({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await autosend.sendEmail(ctx, {
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      idempotencyKey: args.idempotencyKey,
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
    subject: v.string(),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    idempotencyKeyPrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recipients = Array.from(
      new Set(args.recipients.map((value) => value.trim()).filter(Boolean)),
    );

    const result = await autosend.sendBulk(ctx, {
      recipients,
      subject: args.subject,
      html: args.html,
      text: args.text,
      idempotencyKeyPrefix: args.idempotencyKeyPrefix,
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

    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const status = await autosend.status(ctx, { emailId: entry.emailId });
        return {
          ...entry,
          status,
        };
      }),
    );

    return enriched;
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
