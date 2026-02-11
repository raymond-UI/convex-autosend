import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { TERMINAL_STATUSES } from "./types";

export const oldTerminalBatch = internalQuery({
  args: {
    before: v.number(),
    limit: v.number(),
  },
  returns: v.array(v.object({ emailId: v.string() })),
  handler: async (ctx, args) => {
    const results: { emailId: string }[] = [];

    const dbQuery = ctx.db.query("emails").withIndex("by_updatedAt").order("asc");

    for await (const email of dbQuery) {
      if (email.updatedAt > args.before) break;
      if (!TERMINAL_STATUSES.includes(email.status)) continue;
      results.push({ emailId: email.emailId });
      if (results.length >= args.limit) break;
    }

    return results;
  },
});

export const abandonedSendingBatch = internalQuery({
  args: {
    staleBefore: v.number(),
    limit: v.number(),
  },
  returns: v.array(v.object({ emailId: v.string() })),
  handler: async (ctx, args) => {
    const results: { emailId: string }[] = [];

    const dbQuery = ctx.db.query("emails").withIndex("by_updatedAt").order("asc");

    for await (const email of dbQuery) {
      if (email.updatedAt > args.staleBefore) break;
      if (email.status !== "sending") continue;
      results.push({ emailId: email.emailId });
      if (results.length >= args.limit) break;
    }

    return results;
  },
});

export const deleteEmailsById = internalMutation({
  args: {
    emailIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const emailId of args.emailIds) {
      const email = await ctx.db
        .query("emails")
        .withIndex("by_emailId", (q) => q.eq("emailId", emailId))
        .unique();
      if (email) {
        await ctx.db.delete(email._id);
      }
    }
    return null;
  },
});

export const recoverAbandoned = internalMutation({
  args: {
    emailIds: v.array(v.string()),
    now: v.number(),
    retryDelaysMs: v.array(v.number()),
  },
  returns: v.object({ recoveredCount: v.number(), failedCount: v.number() }),
  handler: async (ctx, args) => {
    let recoveredCount = 0;
    let failedCount = 0;

    for (const emailId of args.emailIds) {
      const email = await ctx.db
        .query("emails")
        .withIndex("by_emailId", (q) => q.eq("emailId", emailId))
        .unique();

      if (!email || email.status !== "sending") continue;

      const nextAttemptCount = email.attemptCount + 1;

      if (nextAttemptCount < email.maxAttempts) {
        const delayIndex = Math.min(
          email.attemptCount,
          Math.max(0, args.retryDelaysMs.length - 1),
        );
        const delayMs = args.retryDelaysMs[delayIndex] ?? 5000;
        await ctx.db.patch(email._id, {
          status: "retrying",
          attemptCount: nextAttemptCount,
          nextAttemptAt: args.now + Math.max(0, delayMs),
          providerStatus: "retrying",
          lastError: "Recovered abandoned sending state",
          updatedAt: args.now,
        });
        recoveredCount += 1;
      } else {
        await ctx.db.patch(email._id, {
          status: "failed",
          attemptCount: nextAttemptCount,
          failedAt: args.now,
          providerStatus: "failed",
          lastError: "Marked failed from abandoned sending state",
          updatedAt: args.now,
        });
        failedCount += 1;
      }
    }

    return { recoveredCount, failedCount };
  },
});
