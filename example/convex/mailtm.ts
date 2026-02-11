import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type MailTmDomainRecord = {
  domain?: string;
  name?: string;
  isActive?: boolean;
  active?: boolean;
  is_active?: boolean;
  isPrivate?: boolean;
  private?: boolean;
  is_private?: boolean;
};

type MailTmSummaryMessage = {
  id: string;
  from?: { address?: string; name?: string };
  subject?: string;
  intro?: string;
  seen?: boolean;
  createdAt?: string;
};

const MAILTM_BASE_URL = "https://api.mail.tm";

function randomString(size: number) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let index = 0; index < size; index += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

function messageTimestamp(input?: string): number {
  if (!input) return Date.now();
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeHtml(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const joined = value.filter((item) => typeof item === "string").join("\n");
    return joined.length > 0 ? joined : undefined;
  }
  return undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return undefined;
}

function isLikelyDomain(value: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

function normalizeDomainRecords(payload: unknown): MailTmDomainRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as MailTmDomainRecord[];
  }

  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;

  const container =
    data["hydra:member"] ??
    data.member ??
    data.domains ??
    data.data ??
    data.results;

  if (!Array.isArray(container)) return [];
  return container.filter((item) => item && typeof item === "object") as MailTmDomainRecord[];
}

function selectDomain(records: MailTmDomainRecord[]): string | null {
  const candidates = records
    .map((record) => {
      const domain = typeof record.domain === "string"
        ? record.domain.trim()
        : typeof record.name === "string"
          ? record.name.trim()
          : "";

      if (!domain || !isLikelyDomain(domain)) return null;

      const isActive =
        coerceBoolean(record.isActive) ??
        coerceBoolean(record.active) ??
        coerceBoolean(record.is_active);
      const isPrivate =
        coerceBoolean(record.isPrivate) ??
        coerceBoolean(record.private) ??
        coerceBoolean(record.is_private);

      return {
        domain,
        disallowed: isActive === false || isPrivate === true,
      };
    })
    .filter(Boolean) as Array<{ domain: string; disallowed: boolean }>;

  const preferred = candidates.find((item) => !item.disallowed);
  if (preferred) return preferred.domain;

  return candidates[0]?.domain ?? null;
}

async function apiJson<T>(
  path: string,
  init: RequestInit,
  token?: string,
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${MAILTM_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  let parsed: any = undefined;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    const detail =
      parsed?.detail ?? parsed?.message ?? `mail.tm request failed with ${response.status}`;
    throw new Error(String(detail));
  }

  return {
    status: response.status,
    data: parsed as T,
  };
}

async function fetchToken(address: string, password: string): Promise<string> {
  const tokenResult = await apiJson<{ token: string }>(
    "/token",
    {
      method: "POST",
      body: JSON.stringify({ address, password }),
    },
  );

  if (!tokenResult.data?.token) {
    throw new Error("mail.tm token response missing token");
  }

  return tokenResult.data.token;
}

async function listRemoteMessagesWithFreshToken(args: {
  address: string;
  password: string;
  token: string;
}): Promise<{ token: string; messages: MailTmSummaryMessage[] }> {
  try {
    const list = await apiJson<{ "hydra:member"?: MailTmSummaryMessage[] }>(
      "/messages?page=1",
      { method: "GET" },
      args.token,
    );

    return {
      token: args.token,
      messages: list.data["hydra:member"] ?? [],
    };
  } catch (error) {
    const refreshed = await fetchToken(args.address, args.password);
    const list = await apiJson<{ "hydra:member"?: MailTmSummaryMessage[] }>(
      "/messages?page=1",
      { method: "GET" },
      refreshed,
    );
    return {
      token: refreshed,
      messages: list.data["hydra:member"] ?? [],
    };
  }
}

export const listInboxes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("mailtmInboxes")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});

export const listMessages = query({
  args: {
    inboxId: v.id("mailtmInboxes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await ctx.db
      .query("mailtmMessages")
      .withIndex("by_inboxId_receivedAt", (q) => q.eq("inboxId", args.inboxId))
      .order("desc")
      .take(limit);
  },
});

export const deleteInbox = mutation({
  args: {
    inboxId: v.id("mailtmInboxes"),
  },
  handler: async (ctx, args) => {
    const inbox = await ctx.db.get(args.inboxId);
    if (!inbox) return { deleted: false };

    const messages = await ctx.db
      .query("mailtmMessages")
      .withIndex("by_inboxId_receivedAt", (q) => q.eq("inboxId", args.inboxId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(inbox._id);
    return { deleted: true };
  },
});

export const createInbox = action({
  args: {
    label: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    inboxId: Id<"mailtmInboxes">;
    address: string;
    password: string;
    accountId: string;
  }> => {
    const domainsResult = await apiJson<unknown>(
      "/domains?page=1",
      { method: "GET" },
    );

    const domainRecords = normalizeDomainRecords(domainsResult.data);
    const domain = selectDomain(domainRecords);

    if (!domain) {
      throw new Error("mail.tm did not return a usable domain");
    }

    const localPart = `autosend-${Date.now().toString(36)}-${randomString(5)}`;
    const address = `${localPart}@${domain}`;
    const password = `A1!${randomString(12)}`;

    const accountResult = await apiJson<{ id: string }>(
      "/accounts",
      {
        method: "POST",
        body: JSON.stringify({ address, password }),
      },
    );

    const token = await fetchToken(address, password);

    const inboxId: Id<"mailtmInboxes"> = await ctx.runMutation(
      internal.mailtm.upsertInboxInternal,
      {
      label: args.label,
      address,
      password,
      accountId: accountResult.data.id,
      token,
      now: Date.now(),
      },
    );

    return {
      inboxId,
      address,
      password,
      accountId: accountResult.data.id,
    };
  },
});

export const syncInbox = action({
  args: {
    inboxId: v.id("mailtmInboxes"),
  },
  handler: async (ctx, args): Promise<{
    inboxId: Id<"mailtmInboxes">;
    syncedCount: number;
  }> => {
    const inbox = await ctx.runQuery(internal.mailtm.getInboxInternal, {
      inboxId: args.inboxId,
    });

    if (!inbox) {
      throw new Error("Inbox not found");
    }

    const remote = await listRemoteMessagesWithFreshToken({
      address: inbox.address,
      password: inbox.password,
      token: inbox.token,
    });

    await ctx.runMutation(internal.mailtm.setInboxTokenInternal, {
      inboxId: args.inboxId,
      token: remote.token,
      now: Date.now(),
    });

    await ctx.runMutation(internal.mailtm.upsertMessageSummariesInternal, {
      inboxId: args.inboxId,
      messages: remote.messages.map((message) => ({
        messageId: message.id,
        fromAddress: message.from?.address,
        fromName: message.from?.name,
        subject: message.subject,
        intro: message.intro,
        seen: Boolean(message.seen),
        receivedAt: messageTimestamp(message.createdAt),
      })),
      now: Date.now(),
    });

    return {
      inboxId: args.inboxId,
      syncedCount: remote.messages.length,
    };
  },
});

export const fetchMessage = action({
  args: {
    inboxId: v.id("mailtmInboxes"),
    messageId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    messageId: string;
    subject?: string;
    fromAddress?: string;
    text?: string;
    html?: string;
    seen: boolean;
  }> => {
    const inbox = await ctx.runQuery(internal.mailtm.getInboxInternal, {
      inboxId: args.inboxId,
    });

    if (!inbox) {
      throw new Error("Inbox not found");
    }

    const remoteList = await listRemoteMessagesWithFreshToken({
      address: inbox.address,
      password: inbox.password,
      token: inbox.token,
    });

    const detail = await apiJson<any>(
      `/messages/${args.messageId}`,
      { method: "GET" },
      remoteList.token,
    );

    await ctx.runMutation(internal.mailtm.setInboxTokenInternal, {
      inboxId: args.inboxId,
      token: remoteList.token,
      now: Date.now(),
    });

    await ctx.runMutation(internal.mailtm.upsertMessageDetailsInternal, {
      inboxId: args.inboxId,
      messageId: args.messageId,
      fromAddress: detail.data?.from?.address,
      fromName: detail.data?.from?.name,
      subject: detail.data?.subject,
      intro: detail.data?.intro,
      seen: Boolean(detail.data?.seen),
      receivedAt: messageTimestamp(detail.data?.createdAt),
      text: typeof detail.data?.text === "string" ? detail.data.text : undefined,
      html: normalizeHtml(detail.data?.html),
      now: Date.now(),
    });

    return {
      messageId: args.messageId,
      subject: detail.data?.subject,
      fromAddress: detail.data?.from?.address,
      text: typeof detail.data?.text === "string" ? detail.data.text : undefined,
      html: normalizeHtml(detail.data?.html),
      seen: Boolean(detail.data?.seen),
    };
  },
});

export const upsertInboxInternal = internalMutation({
  args: {
    label: v.optional(v.string()),
    address: v.string(),
    password: v.string(),
    accountId: v.string(),
    token: v.string(),
    now: v.number(),
  },
  returns: v.id("mailtmInboxes"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mailtmInboxes")
      .withIndex("by_address", (q) => q.eq("address", args.address))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        password: args.password,
        accountId: args.accountId,
        token: args.token,
        updatedAt: args.now,
      });
      return existing._id;
    }

    return await ctx.db.insert("mailtmInboxes", {
      label: args.label,
      address: args.address,
      password: args.password,
      accountId: args.accountId,
      token: args.token,
      createdAt: args.now,
      updatedAt: args.now,
    });
  },
});

export const getInboxInternal = internalQuery({
  args: {
    inboxId: v.id("mailtmInboxes"),
  },
  returns: v.union(
    v.object({
      _id: v.id("mailtmInboxes"),
      _creationTime: v.number(),
      label: v.optional(v.string()),
      address: v.string(),
      password: v.string(),
      accountId: v.string(),
      token: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.inboxId);
  },
});

export const setInboxTokenInternal = internalMutation({
  args: {
    inboxId: v.id("mailtmInboxes"),
    token: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const inbox = await ctx.db.get(args.inboxId);
    if (!inbox) return null;

    await ctx.db.patch(inbox._id, {
      token: args.token,
      updatedAt: args.now,
    });

    return null;
  },
});

export const upsertMessageSummariesInternal = internalMutation({
  args: {
    inboxId: v.id("mailtmInboxes"),
    messages: v.array(
      v.object({
        messageId: v.string(),
        fromAddress: v.optional(v.string()),
        fromName: v.optional(v.string()),
        subject: v.optional(v.string()),
        intro: v.optional(v.string()),
        seen: v.boolean(),
        receivedAt: v.number(),
      }),
    ),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const message of args.messages) {
      const existing = await ctx.db
        .query("mailtmMessages")
        .withIndex("by_messageId", (q) => q.eq("messageId", message.messageId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          inboxId: args.inboxId,
          fromAddress: message.fromAddress,
          fromName: message.fromName,
          subject: message.subject,
          intro: message.intro,
          seen: message.seen,
          receivedAt: message.receivedAt,
          updatedAt: args.now,
        });
        continue;
      }

      await ctx.db.insert("mailtmMessages", {
        inboxId: args.inboxId,
        messageId: message.messageId,
        fromAddress: message.fromAddress,
        fromName: message.fromName,
        subject: message.subject,
        intro: message.intro,
        seen: message.seen,
        receivedAt: message.receivedAt,
        updatedAt: args.now,
      });
    }

    return null;
  },
});

export const upsertMessageDetailsInternal = internalMutation({
  args: {
    inboxId: v.id("mailtmInboxes"),
    messageId: v.string(),
    fromAddress: v.optional(v.string()),
    fromName: v.optional(v.string()),
    subject: v.optional(v.string()),
    intro: v.optional(v.string()),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    seen: v.boolean(),
    receivedAt: v.number(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mailtmMessages")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        inboxId: args.inboxId,
        fromAddress: args.fromAddress,
        fromName: args.fromName,
        subject: args.subject,
        intro: args.intro,
        text: args.text,
        html: args.html,
        seen: args.seen,
        receivedAt: args.receivedAt,
        updatedAt: args.now,
      });
      return null;
    }

    await ctx.db.insert("mailtmMessages", {
      inboxId: args.inboxId,
      messageId: args.messageId,
      fromAddress: args.fromAddress,
      fromName: args.fromName,
      subject: args.subject,
      intro: args.intro,
      text: args.text,
      html: args.html,
      seen: args.seen,
      receivedAt: args.receivedAt,
      updatedAt: args.now,
    });

    return null;
  },
});
