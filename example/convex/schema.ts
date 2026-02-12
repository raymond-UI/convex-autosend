import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  demoEmails: defineTable({
    emailId: v.string(),
    recipient: v.string(),
    subject: v.optional(v.string()),
    mode: v.union(v.literal("single"), v.literal("bulk")),
    createdAt: v.number(),
  })
    .index("by_emailId", ["emailId"])
    .index("by_createdAt", ["createdAt"]),

  mailtmInboxes: defineTable({
    label: v.optional(v.string()),
    address: v.string(),
    password: v.string(),
    accountId: v.string(),
    token: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_address", ["address"])
    .index("by_createdAt", ["createdAt"]),

  mailtmMessages: defineTable({
    inboxId: v.id("mailtmInboxes"),
    messageId: v.string(),
    fromAddress: v.optional(v.string()),
    fromName: v.optional(v.string()),
    subject: v.optional(v.string()),
    intro: v.optional(v.string()),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    seen: v.boolean(),
    hasAttachments: v.optional(v.boolean()),
    attachments: v.optional(
      v.array(
        v.object({
          id: v.string(),
          filename: v.string(),
          contentType: v.optional(v.string()),
          size: v.optional(v.number()),
          downloadUrl: v.optional(v.string()),
        }),
      ),
    ),
    receivedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_inboxId_receivedAt", ["inboxId", "receivedAt"]),
});
