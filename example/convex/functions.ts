import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { autosend } from "./email";

export const send = mutation({
  args: {
    to: v.array(v.string()),
    subject: v.string(),
    html: v.string(),
  },
  handler: async (ctx, args) => {
    return await autosend.sendEmail(ctx, {
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
  },
});

export const status = query({
  args: {
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    return await autosend.status(ctx, { emailId: args.emailId });
  },
});

export const cancel = mutation({
  args: {
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    return await autosend.cancelEmail(ctx, { emailId: args.emailId });
  },
});

export const processQueue = action({
  args: {},
  handler: async (ctx) => {
    return await autosend.processQueue(ctx);
  },
});

export const setConfig = mutation({
  args: {
    autosendApiKey: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    testMode: v.optional(v.boolean()),
    defaultFrom: v.optional(v.string()),
    sandboxTo: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await autosend.setConfig(ctx, {
      config: {
        autosendApiKey: args.autosendApiKey,
        webhookSecret: args.webhookSecret,
        testMode: args.testMode,
        defaultFrom: args.defaultFrom,
        sandboxTo: args.sandboxTo,
      },
    });
  },
});

export const cleanup = action({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await autosend.cleanupOldEmails(ctx, {
      dryRun: args.dryRun,
    });
  },
});
