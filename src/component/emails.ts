import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { loadGlobals } from "./config";
import {
  cancelResultValidator,
  emailDocValidator,
  sendBulkArgsValidator,
  sendBulkResultValidator,
  sendEmailArgsValidator,
  sendResultValidator,
  type SendBulkArgs,
  type SendEmailArgs,
} from "./types";

function sanitizeRecipients(recipients: string[]): string[] {
  return Array.from(new Set(recipients.map((recipient) => recipient.trim()).filter(Boolean)));
}

function assertPayloadValid(params: {
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  templateId?: string;
}) {
  if (!params.from) {
    throw new Error("Email sender is required. Provide `from` or set defaultFrom in component config.");
  }

  if (!params.templateId && !params.subject) {
    throw new Error("Either subject or templateId is required.");
  }

  if (!params.templateId && !params.html && !params.text) {
    throw new Error("Either html/text content or templateId is required.");
  }
}

function randomEmailId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `em_${globalThis.crypto.randomUUID()}`;
  }
  return `em_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function stableClone(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((item) => stableClone(item));
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      const next = stableClone(object[key]);
      if (next === undefined) continue;
      out[key] = next;
    }
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  const fields = Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
  return `{${fields.join(",")}}`;
}

async function hashForIdempotency(payload: unknown): Promise<string> {
  const serialized = stableStringify(stableClone(payload));
  const encoder = new TextEncoder();
  const bytes = encoder.encode(serialized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const digestBytes = new Uint8Array(digest);
  return Array.from(digestBytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function resolveIdempotencyKey(args: {
  provided?: string;
  payload: unknown;
}): Promise<string> {
  if (args.provided && args.provided.trim().length > 0) {
    return args.provided.trim();
  }
  return await hashForIdempotency(args.payload);
}

function buildIdempotencyPayload(args: SendEmailArgs & { from: string; to: string[] }) {
  return {
    to: args.to,
    from: args.from,
    replyTo: args.replyTo,
    subject: args.subject,
    html: args.html,
    text: args.text,
    templateId: args.templateId,
    dynamicData: args.dynamicData,
    attachments: args.attachments,
  };
}

export const sendEmail = mutation({
  args: sendEmailArgsValidator,
  returns: sendResultValidator,
  handler: async (ctx, args) => {
    const globals = await loadGlobals(ctx);
    const to = sanitizeRecipients(args.to);

    if (to.length === 0) {
      throw new Error("At least one recipient is required.");
    }
    if (to.length > 1) {
      throw new Error(
        "sendEmail supports a single recipient. Use sendBulk for multiple recipients.",
      );
    }

    const from = args.from ?? globals.defaultFrom;
    const replyTo = args.replyTo ?? globals.defaultReplyTo;

    assertPayloadValid({
      from,
      subject: args.subject,
      html: args.html,
      text: args.text,
      templateId: args.templateId,
    });

    const idempotencyKey = await resolveIdempotencyKey({
      provided: args.idempotencyKey,
      payload: buildIdempotencyPayload({ ...args, from: from!, to }),
    });

    const existing = await ctx.db
      .query("emails")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();

    if (existing) {
      return {
        emailId: existing.emailId,
        deduped: true,
      };
    }

    const now = Date.now();
    const emailId = randomEmailId();

    await ctx.db.insert("emails", {
      emailId,
      idempotencyKey,
      status: "queued",
      to,
      from: from!,
      replyTo,
      subject: args.subject,
      html: args.html,
      text: args.text,
      templateId: args.templateId,
      dynamicData: args.dynamicData,
      attachments: args.attachments,
      metadata: args.metadata,
      attemptCount: 0,
      maxAttempts: globals.maxAttempts,
      nextAttemptAt: now,
      queuedAt: now,
      updatedAt: now,
    });

    return {
      emailId,
      deduped: false,
    };
  },
});

function buildBulkRecipientPayload(args: SendBulkArgs & { from: string; recipient: string }) {
  return {
    to: [args.recipient],
    from: args.from,
    replyTo: args.replyTo,
    subject: args.subject,
    html: args.html,
    text: args.text,
    templateId: args.templateId,
    dynamicData: args.dynamicData,
    attachments: args.attachments,
  };
}

export const sendBulk = mutation({
  args: sendBulkArgsValidator,
  returns: sendBulkResultValidator,
  handler: async (ctx, args) => {
    const globals = await loadGlobals(ctx);

    const recipients = sanitizeRecipients(args.recipients);
    if (recipients.length === 0) {
      throw new Error("At least one recipient is required.");
    }
    if (recipients.length > 100) {
      throw new Error("Bulk send supports up to 100 recipients per request.");
    }

    const from = args.from ?? globals.defaultFrom;
    const replyTo = args.replyTo ?? globals.defaultReplyTo;

    assertPayloadValid({
      from,
      subject: args.subject,
      html: args.html,
      text: args.text,
      templateId: args.templateId,
    });

    const now = Date.now();
    const emailIds: string[] = [];
    let insertedCount = 0;

    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index]!;

      const payload = buildBulkRecipientPayload({
        ...args,
        recipient,
        from: from!,
      });

      const baseKey =
        args.idempotencyKeyPrefix && args.idempotencyKeyPrefix.trim().length > 0
          ? args.idempotencyKeyPrefix.trim()
          : await hashForIdempotency(payload);

      const idempotencyKey = `${baseKey}:${index}:${recipient}`;

      const existing = await ctx.db
        .query("emails")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();

      if (existing) {
        emailIds.push(existing.emailId);
        continue;
      }

      const emailId = randomEmailId();
      emailIds.push(emailId);
      insertedCount += 1;

      await ctx.db.insert("emails", {
        emailId,
        idempotencyKey,
        status: "queued",
        to: [recipient],
        from: from!,
        replyTo,
        subject: args.subject,
        html: args.html,
        text: args.text,
        templateId: args.templateId,
        dynamicData: args.dynamicData,
        attachments: args.attachments,
        metadata: args.metadata,
        attemptCount: 0,
        maxAttempts: globals.maxAttempts,
        nextAttemptAt: now,
        queuedAt: now,
        updatedAt: now,
      });
    }

    if (insertedCount > 0) {
      // no-op; queue processing can be triggered explicitly via `queue.processQueue`
    }

    return {
      emailIds,
      acceptedCount: emailIds.length,
    };
  },
});

export const cancelEmail = mutation({
  args: {
    emailId: v.string(),
  },
  returns: cancelResultValidator,
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
      .unique();

    if (!email) return { canceled: false };

    if (email.status !== "queued" && email.status !== "retrying") {
      return { canceled: false };
    }

    const now = Date.now();
    await ctx.db.patch(email._id, {
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
      providerStatus: "canceled",
    });

    return { canceled: true };
  },
});

export const claimQueuedEmail = internalMutation({
  args: {
    emailId: v.string(),
    now: v.number(),
  },
  returns: v.union(emailDocValidator, v.null()),
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
      .unique();

    if (!email) return null;
    if (email.status !== "queued" && email.status !== "retrying") return null;
    if (email.nextAttemptAt > args.now) return null;

    await ctx.db.patch(email._id, {
      status: "sending",
      lastAttemptAt: args.now,
      updatedAt: args.now,
    });

    return {
      ...email,
      status: "sending" as const,
      lastAttemptAt: args.now,
      updatedAt: args.now,
    };
  },
});

export const markSendSuccess = internalMutation({
  args: {
    emailId: v.string(),
    providerMessageId: v.string(),
    providerStatus: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
      .unique();

    if (!email) return null;
    if (email.status === "canceled") return null;

    await ctx.db.patch(email._id, {
      status: "sent",
      providerMessageId: args.providerMessageId,
      providerStatus: args.providerStatus ?? "queued",
      sentAt: args.now,
      updatedAt: args.now,
    });

    return null;
  },
});

export const markSendFailure = internalMutation({
  args: {
    emailId: v.string(),
    error: v.string(),
    retryable: v.boolean(),
    nextAttemptAt: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.union(v.literal("retrying"), v.literal("failed"), v.null()),
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_emailId", (q) => q.eq("emailId", args.emailId))
      .unique();

    if (!email) return null;
    if (email.status === "canceled") return null;

    const nextAttemptCount = email.attemptCount + 1;

    if (
      args.retryable &&
      nextAttemptCount < email.maxAttempts &&
      args.nextAttemptAt !== undefined
    ) {
      await ctx.db.patch(email._id, {
        status: "retrying",
        attemptCount: nextAttemptCount,
        nextAttemptAt: args.nextAttemptAt,
        lastError: args.error,
        providerStatus: "retrying",
        updatedAt: args.now,
      });
      return "retrying";
    }

    await ctx.db.patch(email._id, {
      status: "failed",
      attemptCount: nextAttemptCount,
      failedAt: args.now,
      lastError: args.error,
      providerStatus: "failed",
      updatedAt: args.now,
    });

    return "failed";
  },
});
