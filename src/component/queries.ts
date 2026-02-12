import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { emailDocValidator } from "./types";

export const status = query({
  args: {
    emailId: v.string(),
  },
  returns: v.union(emailDocValidator, v.null()),
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
      .unique();

    return email ?? null;
  },
});

export const getByEmailId = internalQuery({
  args: {
    emailId: v.string(),
  },
  returns: v.union(emailDocValidator, v.null()),
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
      .unique();

    return email ?? null;
  },
});

export const getByProviderMessageId = internalQuery({
  args: {
    providerMessageId: v.string(),
  },
  returns: v.union(emailDocValidator, v.null()),
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_providerMessageId", (q) =>
        q.eq("providerMessageId", args.providerMessageId),
      )
      .unique();

    return email ?? null;
  },
});

export const dueByStatus = internalQuery({
  args: {
    status: v.union(v.literal("queued"), v.literal("retrying")),
    now: v.number(),
    limit: v.number(),
  },
  returns: v.array(emailDocValidator),
  handler: async (ctx, args) => {
    const results = [];

    const dbQuery = ctx.db
      .query("emails")
      .withIndex("by_status_nextAttemptAt", (q) =>
        q.eq("status", args.status).lte("nextAttemptAt", args.now),
      )
      .order("asc");

    for await (const email of dbQuery) {
      results.push(email);
      if (results.length >= args.limit) break;
    }

    return results;
  },
});

export const listEvents = query({
  args: {
    emailId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      emailId: v.string(),
      eventType: v.string(),
      payload: v.any(),
      providerMessageId: v.optional(v.string()),
      occurredAt: v.number(),
      receivedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const events = await ctx.db
      .query("emailEvents")
      .withIndex("by_emailId_occurredAt", (q) => q.eq("emailId", args.emailId))
      .order("desc")
      .take(limit);
    return events.map((e) => ({
      emailId: e.emailId,
      eventType: e.eventType,
      payload: e.payload,
      providerMessageId: e.providerMessageId,
      occurredAt: e.occurredAt,
      receivedAt: e.receivedAt,
    }));
  },
});

export const hasAnyDue = internalQuery({
  args: {
    now: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const statuses: Array<"queued" | "retrying"> = ["queued", "retrying"];

    for (const status of statuses) {
      const first = await ctx.db
        .query("emails")
        .withIndex("by_status_nextAttemptAt", (q) =>
          q.eq("status", status).lte("nextAttemptAt", args.now),
        )
        .first();
      if (first) return true;
    }

    return false;
  },
});
