import { action } from "./_generated/server";
import { v } from "convex/values";
import { processQueueResultValidator, type ProcessQueueResult } from "./types";
import { internal } from "./_generated/api";

export const processQueue = action({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: processQueueResultValidator,
  handler: async (ctx, args): Promise<ProcessQueueResult> => {
    return await ctx.runAction(internal.queueInternal.processDueQueue, {
      batchSize: args.batchSize,
    });
  },
});
