import { action } from "./_generated/server";
import { v } from "convex/values";
import { webhookHandleResultValidator, type WebhookHandleResult } from "./types";
import { internal } from "./_generated/api";

function parseTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber)) {
    if (asNumber > 0 && asNumber < 1_000_000_000_000) {
      return Math.floor(asNumber * 1000);
    }
    return Math.floor(asNumber);
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function normalizeSignature(signature: string): string {
  const trimmed = signature.trim();
  if (trimmed.startsWith("hmac-sha256=")) {
    return trimmed.slice("hmac-sha256=".length);
  }
  return trimmed;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(value)) return null;
    bytes[index] = value;
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index]! ^ b[index]!;
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const bytes = new Uint8Array(signature);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(args: {
  rawBody: string;
  signature: string;
  secret: string;
}): Promise<boolean> {
  const expected = await hmacSha256Hex(args.secret, args.rawBody);
  const actual = normalizeSignature(args.signature);

  const expectedBytes = hexToBytes(expected);
  const actualBytes = hexToBytes(actual);
  if (!expectedBytes || !actualBytes) return false;

  return timingSafeEqual(expectedBytes, actualBytes);
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function getNested(data: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = data;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function extractEmailId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as Record<string, unknown>;

  const candidates = [
    pickString(data.emailId),
    pickString(data.email_id),
    pickString(getNested(data, ["email", "id"])),
    pickString(getNested(data, ["data", "emailId"])),
    pickString(getNested(data, ["data", "email", "id"])),
  ];

  return candidates.find(Boolean);
}

function extractProviderMessageId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as Record<string, unknown>;

  const candidates = [
    pickString(data.providerMessageId),
    pickString(data.messageId),
    pickString(data.emailId),
    pickString(getNested(data, ["email", "providerMessageId"])),
    pickString(getNested(data, ["data", "messageId"])),
    pickString(getNested(data, ["data", "providerMessageId"])),
    pickString(getNested(data, ["data", "emailId"])),
  ];

  return candidates.find(Boolean);
}

function extractOccurredAt(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as Record<string, unknown>;

  const candidates = [
    data.occurredAt,
    data.timestamp,
    getNested(data, ["event", "timestamp"]),
    getNested(data, ["data", "timestamp"]),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number") {
      return candidate < 1_000_000_000_000 ? Math.floor(candidate * 1000) : candidate;
    }
    if (typeof candidate === "string") {
      const parsed = parseTimestamp(candidate);
      if (parsed !== null) return parsed;
    }
  }

  return undefined;
}

export const handleCallback = action({
  args: {
    rawBody: v.string(),
    signature: v.string(),
    event: v.string(),
    deliveryId: v.string(),
    timestamp: v.string(),
    webhookSecret: v.optional(v.string()),
  },
  returns: webhookHandleResultValidator,
  handler: async (ctx, args): Promise<WebhookHandleResult> => {
    const globals = await ctx.runQuery(internal.config.getGlobalsInternal, {});
    const webhookSecret = args.webhookSecret ?? globals.webhookSecret;

    if (!webhookSecret) {
      return {
        ok: false,
        eventType: args.event,
        error: "webhook_secret_missing",
      };
    }

    const timestampMs = parseTimestamp(args.timestamp);
    if (timestampMs === null) {
      return {
        ok: false,
        eventType: args.event,
        error: "invalid_timestamp",
      };
    }

    const now = Date.now();
    const maxSkewMs = 5 * 60 * 1000;
    if (Math.abs(now - timestampMs) > maxSkewMs) {
      return {
        ok: false,
        eventType: args.event,
        error: "timestamp_skew_exceeded",
      };
    }

    const isValidSignature = await verifySignature({
      rawBody: args.rawBody,
      signature: args.signature,
      secret: webhookSecret,
    });

    if (!isValidSignature) {
      return {
        ok: false,
        eventType: args.event,
        error: "invalid_signature",
      };
    }

    const inserted = await ctx.runMutation(
      internal.webhooksInternal.recordWebhookDelivery,
      {
        deliveryId: args.deliveryId,
        eventType: args.event,
        receivedAt: now,
      },
    );

    if (!inserted) {
      return {
        ok: true,
        eventType: args.event,
        duplicate: true,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      return {
        ok: false,
        eventType: args.event,
        error: "invalid_json",
      };
    }

    const extractedEmailId = extractEmailId(payload);
    const extractedProviderMessageId = extractProviderMessageId(payload);

    let resolvedEmailId = extractedEmailId;

    if (resolvedEmailId) {
      const byEmailId = await ctx.runQuery(internal.queries.getByEmailId, {
        emailId: resolvedEmailId,
      });
      if (!byEmailId) {
        resolvedEmailId = undefined;
      }
    }

    if (!resolvedEmailId && extractedProviderMessageId) {
      const byProvider = await ctx.runQuery(internal.queries.getByProviderMessageId, {
        providerMessageId: extractedProviderMessageId,
      });
      if (byProvider) {
        resolvedEmailId = byProvider.emailId;
      }
    }

    if (!resolvedEmailId && extractedEmailId) {
      const byProvider = await ctx.runQuery(internal.queries.getByProviderMessageId, {
        providerMessageId: extractedEmailId,
      });
      if (byProvider) {
        resolvedEmailId = byProvider.emailId;
      }
    }

    const occurredAt = extractOccurredAt(payload) ?? now;

    await ctx.runMutation(internal.webhooksInternal.storeEventAndApply, {
      emailId: resolvedEmailId ?? "unknown",
      eventType: args.event,
      payload,
      providerMessageId: extractedProviderMessageId,
      occurredAt,
      receivedAt: now,
    });

    return {
      ok: true,
      eventType: args.event,
      emailId: resolvedEmailId,
    };
  },
});
