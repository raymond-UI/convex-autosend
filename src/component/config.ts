import { internalQuery, mutation, query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import { v } from "convex/values";
import {
  configUpdateValidator,
  providerCompatibilityModeValidator,
  safeConfigValidator,
} from "./types";

const GLOBALS_KEY = "globals" as const;

export const DEFAULT_RETRY_DELAYS_MS = [5000, 10000, 20000] as const;
export const DEFAULT_MAX_ATTEMPTS = 4;
export const DEFAULT_RATE_LIMIT_RPS = 2;
export const DEFAULT_SEND_BATCH_SIZE = 25;
export const DEFAULT_CLEANUP_BATCH_SIZE = 100;
export const DEFAULT_AUTOSEND_BASE_URL = "https://api.autosend.com";

export type Globals = {
  autosendApiKey?: string;
  webhookSecret?: string;
  testMode?: boolean;
  defaultFrom?: string;
  defaultReplyTo?: string;
  sandboxTo?: string[];
  rateLimitRps?: number;
  retryDelaysMs?: number[];
  maxAttempts?: number;
  sendBatchSize?: number;
  cleanupBatchSize?: number;
  providerCompatibilityMode?: "strict" | "lenient";
  autosendBaseUrl?: string;
};

export type ResolvedGlobals = {
  autosendApiKey?: string;
  webhookSecret?: string;
  testMode: boolean;
  defaultFrom?: string;
  defaultReplyTo?: string;
  sandboxTo: string[];
  rateLimitRps: number;
  retryDelaysMs: number[];
  maxAttempts: number;
  sendBatchSize: number;
  cleanupBatchSize: number;
  providerCompatibilityMode: "strict" | "lenient";
  autosendBaseUrl: string;
};

function sanitizeStringList(values: string[] | undefined): string[] {
  if (!values) return [];
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function withDefaults(globals: Globals): ResolvedGlobals {
  return {
    autosendApiKey: globals.autosendApiKey,
    webhookSecret: globals.webhookSecret,
    testMode: globals.testMode ?? true,
    defaultFrom: globals.defaultFrom,
    defaultReplyTo: globals.defaultReplyTo,
    sandboxTo: sanitizeStringList(globals.sandboxTo),
    rateLimitRps: Math.max(1, Math.floor(globals.rateLimitRps ?? DEFAULT_RATE_LIMIT_RPS)),
    retryDelaysMs:
      globals.retryDelaysMs && globals.retryDelaysMs.length > 0
        ? globals.retryDelaysMs.map((value) => Math.max(0, Math.floor(value)))
        : [...DEFAULT_RETRY_DELAYS_MS],
    maxAttempts: Math.max(1, Math.floor(globals.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)),
    sendBatchSize: Math.max(1, Math.floor(globals.sendBatchSize ?? DEFAULT_SEND_BATCH_SIZE)),
    cleanupBatchSize: Math.max(
      1,
      Math.floor(globals.cleanupBatchSize ?? DEFAULT_CLEANUP_BATCH_SIZE),
    ),
    providerCompatibilityMode: globals.providerCompatibilityMode ?? "strict",
    autosendBaseUrl: globals.autosendBaseUrl ?? DEFAULT_AUTOSEND_BASE_URL,
  };
}

async function readGlobals(db: DatabaseReader): Promise<Globals> {
  const record = await db
    .query("globals")
    .withIndex("by_singleton", (q) => q.eq("singleton", GLOBALS_KEY))
    .unique();

  if (!record) return {};

  return {
    autosendApiKey: record.autosendApiKey,
    webhookSecret: record.webhookSecret,
    testMode: record.testMode,
    defaultFrom: record.defaultFrom,
    defaultReplyTo: record.defaultReplyTo,
    sandboxTo: record.sandboxTo,
    rateLimitRps: record.rateLimitRps,
    retryDelaysMs: record.retryDelaysMs,
    maxAttempts: record.maxAttempts,
    sendBatchSize: record.sendBatchSize,
    cleanupBatchSize: record.cleanupBatchSize,
    providerCompatibilityMode: record.providerCompatibilityMode,
    autosendBaseUrl: record.autosendBaseUrl,
  };
}

export async function loadGlobals(ctx: { db: DatabaseReader }): Promise<ResolvedGlobals> {
  const globals = await readGlobals(ctx.db);
  return withDefaults(globals);
}

export const getGlobalsInternal = internalQuery({
  args: {},
  returns: v.object({
    autosendApiKey: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
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
  }),
  handler: async (ctx) => {
    return await loadGlobals(ctx);
  },
});

export const setConfig = mutation({
  args: {
    config: configUpdateValidator,
    replace: v.optional(v.boolean()),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("globals")
      .withIndex("by_singleton", (q) => q.eq("singleton", GLOBALS_KEY))
      .unique();

    const normalized = {
      ...args.config,
      ...(args.config.sandboxTo !== undefined
        ? { sandboxTo: sanitizeStringList(args.config.sandboxTo) }
        : {}),
    };

    if (!existing) {
      await ctx.db.insert("globals", {
        singleton: GLOBALS_KEY,
        ...normalized,
      });
      return { created: true };
    }

    if (args.replace) {
      await ctx.db.patch(existing._id, {
        autosendApiKey: normalized.autosendApiKey,
        webhookSecret: normalized.webhookSecret,
        testMode: normalized.testMode,
        defaultFrom: normalized.defaultFrom,
        defaultReplyTo: normalized.defaultReplyTo,
        sandboxTo: normalized.sandboxTo,
        rateLimitRps: normalized.rateLimitRps,
        retryDelaysMs: normalized.retryDelaysMs,
        maxAttempts: normalized.maxAttempts,
        sendBatchSize: normalized.sendBatchSize,
        cleanupBatchSize: normalized.cleanupBatchSize,
        providerCompatibilityMode: normalized.providerCompatibilityMode,
        autosendBaseUrl: normalized.autosendBaseUrl,
      });
      return { created: false };
    }

    const patch: Record<string, unknown> = {};
    if (normalized.autosendApiKey !== undefined)
      patch.autosendApiKey = normalized.autosendApiKey;
    if (normalized.webhookSecret !== undefined)
      patch.webhookSecret = normalized.webhookSecret;
    if (normalized.testMode !== undefined) patch.testMode = normalized.testMode;
    if (normalized.defaultFrom !== undefined)
      patch.defaultFrom = normalized.defaultFrom;
    if (normalized.defaultReplyTo !== undefined)
      patch.defaultReplyTo = normalized.defaultReplyTo;
    if (normalized.sandboxTo !== undefined) patch.sandboxTo = normalized.sandboxTo;
    if (normalized.rateLimitRps !== undefined)
      patch.rateLimitRps = normalized.rateLimitRps;
    if (normalized.retryDelaysMs !== undefined)
      patch.retryDelaysMs = normalized.retryDelaysMs;
    if (normalized.maxAttempts !== undefined)
      patch.maxAttempts = normalized.maxAttempts;
    if (normalized.sendBatchSize !== undefined)
      patch.sendBatchSize = normalized.sendBatchSize;
    if (normalized.cleanupBatchSize !== undefined)
      patch.cleanupBatchSize = normalized.cleanupBatchSize;
    if (normalized.providerCompatibilityMode !== undefined) {
      patch.providerCompatibilityMode = normalized.providerCompatibilityMode;
    }
    if (normalized.autosendBaseUrl !== undefined)
      patch.autosendBaseUrl = normalized.autosendBaseUrl;

    await ctx.db.patch(existing._id, patch as any);
    return { created: false };
  },
});

export const getConfig = query({
  args: {},
  returns: safeConfigValidator,
  handler: async (ctx) => {
    const globals = await loadGlobals(ctx);
    return {
      testMode: globals.testMode,
      defaultFrom: globals.defaultFrom,
      defaultReplyTo: globals.defaultReplyTo,
      sandboxTo: globals.sandboxTo,
      rateLimitRps: globals.rateLimitRps,
      retryDelaysMs: globals.retryDelaysMs,
      maxAttempts: globals.maxAttempts,
      sendBatchSize: globals.sendBatchSize,
      cleanupBatchSize: globals.cleanupBatchSize,
      providerCompatibilityMode: globals.providerCompatibilityMode,
      autosendBaseUrl: globals.autosendBaseUrl,
      hasApiKey: Boolean(globals.autosendApiKey),
      hasWebhookSecret: Boolean(globals.webhookSecret),
    };
  },
});
