import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  type AbandonedCleanupResult,
  type CleanupResult,
  abandonedCleanupResultValidator,
  cleanupResultValidator,
} from "./types";

const DEFAULT_OLD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ABANDONED_STALE_MS = 15 * 60 * 1000;

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

    const batch = await ctx.runQuery(internal.cleanupInternal.oldTerminalBatch, {
      before,
      limit: batchSize,
    });

    const emailIds = batch.map((row: { emailId: string }) => row.emailId);

    if (!args.dryRun && emailIds.length > 0) {
      await ctx.runMutation(internal.cleanupInternal.deleteEmailsById, { emailIds });
    }

    return {
      deletedCount: args.dryRun ? 0 : emailIds.length,
      emailIds,
      hasMore: batch.length >= batchSize,
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

    const batch = await ctx.runQuery(internal.cleanupInternal.abandonedSendingBatch, {
      staleBefore,
      limit: batchSize,
    });

    const emailIds = batch.map((row: { emailId: string }) => row.emailId);

    if (args.dryRun || emailIds.length === 0) {
      return {
        recoveredCount: 0,
        failedCount: 0,
        emailIds,
        hasMore: batch.length >= batchSize,
      };
    }

    const result = await ctx.runMutation(internal.cleanupInternal.recoverAbandoned, {
      emailIds,
      now: Date.now(),
      retryDelaysMs: globals.retryDelaysMs,
    });

    return {
      recoveredCount: result.recoveredCount,
      failedCount: result.failedCount,
      emailIds,
      hasMore: batch.length >= batchSize,
    };
  },
});
