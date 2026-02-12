import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  type AbandonedCleanupResult,
  type CleanupResult,
  type DeliveryCleanupResult,
  abandonedCleanupResultValidator,
  cleanupResultValidator,
  deliveryCleanupResultValidator,
} from "./types";

const DEFAULT_OLD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ABANDONED_STALE_MS = 15 * 60 * 1000;
const DEFAULT_DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Safety cap: maximum number of batch iterations per action invocation to
// avoid unbounded execution time. Each batch processes `batchSize` items.
const MAX_LOOP_ITERATIONS = 20;

export const cleanupOldEmails = action({
  args: {
    olderThanMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: cleanupResultValidator,
  handler: async (ctx, args): Promise<CleanupResult> => {
    const globals = await ctx.runQuery(internal.config.getGlobalsInternal, {});
    const batchSize = Math.max(1, args.batchSize ?? globals.cleanupBatchSize);
    const before = Date.now() - (args.olderThanMs ?? DEFAULT_OLD_RETENTION_MS);

    const allEmailIds: string[] = [];
    let totalDeleted = 0;
    let hasMore = true;

    for (let i = 0; i < MAX_LOOP_ITERATIONS && hasMore; i++) {
      const batch = await ctx.runQuery(internal.cleanupInternal.oldTerminalBatch, {
        before,
        limit: batchSize,
      });

      const emailIds = batch.map((row: { emailId: string }) => row.emailId);
      allEmailIds.push(...emailIds);
      hasMore = batch.length >= batchSize;

      if (args.dryRun || emailIds.length === 0) break;

      await ctx.runMutation(internal.cleanupInternal.deleteEmailsById, { emailIds });
      totalDeleted += emailIds.length;
    }

    return {
      deletedCount: totalDeleted,
      emailIds: allEmailIds,
      hasMore,
    };
  },
});

export const cleanupAbandonedEmails = action({
  args: {
    staleAfterMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: abandonedCleanupResultValidator,
  handler: async (ctx, args): Promise<AbandonedCleanupResult> => {
    const globals = await ctx.runQuery(internal.config.getGlobalsInternal, {});
    const batchSize = Math.max(1, args.batchSize ?? globals.cleanupBatchSize);
    const staleBefore = Date.now() - (args.staleAfterMs ?? DEFAULT_ABANDONED_STALE_MS);

    const allEmailIds: string[] = [];
    let totalRecovered = 0;
    let totalFailed = 0;
    let hasMore = true;

    for (let i = 0; i < MAX_LOOP_ITERATIONS && hasMore; i++) {
      const batch = await ctx.runQuery(internal.cleanupInternal.abandonedSendingBatch, {
        staleBefore,
        limit: batchSize,
      });

      const emailIds = batch.map((row: { emailId: string }) => row.emailId);
      allEmailIds.push(...emailIds);
      hasMore = batch.length >= batchSize;

      if (args.dryRun || emailIds.length === 0) break;

      const result = await ctx.runMutation(internal.cleanupInternal.recoverAbandoned, {
        emailIds,
        now: Date.now(),
        retryDelaysMs: globals.retryDelaysMs,
      });

      totalRecovered += result.recoveredCount;
      totalFailed += result.failedCount;
    }

    return {
      recoveredCount: totalRecovered,
      failedCount: totalFailed,
      emailIds: allEmailIds,
      hasMore,
    };
  },
});

export const cleanupOldDeliveries = action({
  args: {
    olderThanMs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: deliveryCleanupResultValidator,
  handler: async (ctx, args): Promise<DeliveryCleanupResult> => {
    const globals = await ctx.runQuery(internal.config.getGlobalsInternal, {});
    const batchSize = Math.max(1, args.batchSize ?? globals.cleanupBatchSize);
    const before = Date.now() - (args.olderThanMs ?? DEFAULT_DELIVERY_RETENTION_MS);

    let totalDeleted = 0;
    let hasMore = true;

    for (let i = 0; i < MAX_LOOP_ITERATIONS && hasMore; i++) {
      const result = await ctx.runMutation(internal.cleanupInternal.deleteOldDeliveries, {
        before,
        limit: batchSize,
      });

      totalDeleted += result.deletedCount;
      hasMore = result.hasMore;
    }

    return {
      deletedCount: totalDeleted,
      hasMore,
    };
  },
});
