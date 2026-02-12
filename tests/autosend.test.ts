import { afterEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { createHmac } from "node:crypto";

import schema from "../src/component/schema";

const modules = import.meta.glob("../src/component/**/*.ts");

function makeTest() {
  return convexTest(schema, modules);
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function setMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  globalThis.fetch = handler as typeof fetch;
}

function sign(rawBody: string, secret: string, withPrefix = true) {
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  return withPrefix ? `hmac-sha256=${signature}` : signature;
}

describe("autosend component", () => {
  test("sendEmail dedupes by idempotency key", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        defaultFrom: "noreply@example.com",
      },
    });

    const first = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
      idempotencyKey: "msg-1",
    });

    const second = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
      idempotencyKey: "msg-1",
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.emailId).toBe(first.emailId);
  });

  test("queue process marks email sent with provider id", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        autosendApiKey: "as_test_key",
        defaultFrom: "noreply@example.com",
      },
    });

    setMockFetch(async () => {
      return new Response(JSON.stringify({ emailId: "provider_1", status: "queued" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const sent = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Subject",
      html: "<p>Hello</p>",
    });

    const queueResult = await t.action("queue:processQueue", {});
    expect(queueResult.processedCount).toBe(1);
    expect(queueResult.sentCount).toBe(1);

    const status = await t.query("queries:status", { emailId: sent.emailId });
    expect(status?.status).toBe("sent");
    expect(status?.providerMessageId).toBe("provider_1");
  });

  test("retryable errors transition retrying then failed", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        autosendApiKey: "as_test_key",
        defaultFrom: "noreply@example.com",
        retryDelaysMs: [0],
        maxAttempts: 2,
      },
    });

    setMockFetch(async () => {
      return new Response(JSON.stringify({ error: "temporary" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    const sent = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Subject",
      html: "<p>Hello</p>",
    });

    const first = await t.action("queue:processQueue", {});
    expect(first.retriedCount).toBe(1);

    let status = await t.query("queries:status", { emailId: sent.emailId });
    expect(status?.status).toBe("retrying");
    expect(status?.attemptCount).toBe(1);

    const second = await t.action("queue:processQueue", {});
    expect(second.failedCount).toBe(1);

    status = await t.query("queries:status", { emailId: sent.emailId });
    expect(status?.status).toBe("failed");
    expect(status?.attemptCount).toBe(2);
  });

  test("cancelEmail only works for queued/retrying", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        autosendApiKey: "as_test_key",
        defaultFrom: "noreply@example.com",
      },
    });

    const sent = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Cancel me",
      html: "<p>Hello</p>",
    });

    const canceled = await t.mutation("emails:cancelEmail", {
      emailId: sent.emailId,
    });
    expect(canceled.canceled).toBe(true);

    setMockFetch(async () => {
      return new Response(JSON.stringify({ emailId: "provider_2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const queueResult = await t.action("queue:processQueue", {});
    expect(queueResult.processedCount).toBe(0);

    const cancelAgain = await t.mutation("emails:cancelEmail", {
      emailId: sent.emailId,
    });
    expect(cancelAgain.canceled).toBe(false);
  });

  test("webhook dedupes by delivery id", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        webhookSecret: "whsec_123",
      },
    });

    const payload = { emailId: "unknown_id", status: "delivered" };
    const rawBody = JSON.stringify(payload);

    const first = await t.action("webhooks:handleCallback", {
      rawBody,
      signature: sign(rawBody, "whsec_123"),
      event: "email.delivered",
      deliveryId: "delivery_1",
      timestamp: Date.now().toString(),
    });

    const second = await t.action("webhooks:handleCallback", {
      rawBody,
      signature: sign(rawBody, "whsec_123"),
      event: "email.delivered",
      deliveryId: "delivery_1",
      timestamp: Date.now().toString(),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
  });

  test("bounce webhook marks email failed", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        autosendApiKey: "as_test_key",
        webhookSecret: "whsec_456",
        defaultFrom: "noreply@example.com",
      },
    });

    setMockFetch(async () => {
      return new Response(JSON.stringify({ emailId: "provider_9" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const sent = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Webhook me",
      html: "<p>Hello</p>",
    });

    await t.action("queue:processQueue", {});

    const rawBody = JSON.stringify({
      providerMessageId: "provider_9",
      occurredAt: Date.now(),
    });

    const webhook = await t.action("webhooks:handleCallback", {
      rawBody,
      signature: sign(rawBody, "whsec_456"),
      event: "email.bounced",
      deliveryId: "delivery_bounce_1",
      timestamp: Date.now().toString(),
    });

    expect(webhook.ok).toBe(true);

    const status = await t.query("queries:status", { emailId: sent.emailId });
    expect(status?.status).toBe("failed");
    expect(status?.providerStatus).toBe("email.bounced");
  });

  test("cleanup old emails supports dryRun and delete", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        autosendApiKey: "as_test_key",
        defaultFrom: "noreply@example.com",
      },
    });

    setMockFetch(async () => {
      return new Response(JSON.stringify({ emailId: "provider_cleanup" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const sent = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Cleanup",
      html: "<p>Hello</p>",
    });

    await t.action("queue:processQueue", {});

    const dryRun = await t.action("cleanup:cleanupOldEmails", {
      olderThanMs: 0,
      dryRun: true,
    });

    expect(dryRun.deletedCount).toBe(0);
    expect(dryRun.emailIds).toContain(sent.emailId);

    const deleted = await t.action("cleanup:cleanupOldEmails", {
      olderThanMs: 0,
    });

    expect(deleted.deletedCount).toBeGreaterThanOrEqual(1);

    const status = await t.query("queries:status", { emailId: sent.emailId });
    expect(status).toBeNull();
  });

  test("provider payload includes display names, CC, BCC, and unsubscribeGroupId", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        autosendApiKey: "as_test_key",
        defaultFrom: "noreply@example.com",
      },
    });

    let capturedBody: any;
    setMockFetch(async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ emailId: "provider_names" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      toName: "Jane",
      fromName: "Support",
      replyTo: "replies@example.com",
      replyToName: "Reply Handler",
      subject: "Names Test",
      html: "<p>Hi</p>",
      cc: [{ email: "cc@example.com", name: "CC Person" }],
      bcc: [{ email: "bcc@example.com" }],
      unsubscribeGroupId: "unsub-123",
    });

    await t.action("queue:processQueue", {});

    expect(capturedBody.to).toEqual({ email: "user@example.com", name: "Jane" });
    expect(capturedBody.from).toEqual({ email: "noreply@example.com", name: "Support" });
    expect(capturedBody.replyTo).toEqual({ email: "replies@example.com", name: "Reply Handler" });
    expect(capturedBody.cc).toEqual([{ email: "cc@example.com", name: "CC Person" }]);
    expect(capturedBody.bcc).toEqual([{ email: "bcc@example.com" }]);
    expect(capturedBody.unsubscribeGroupId).toBe("unsub-123");
  });

  test("test mode strips CC and BCC from provider payload", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: true,
        autosendApiKey: "as_test_key",
        defaultFrom: "noreply@example.com",
        sandboxTo: ["sandbox@example.com"],
      },
    });

    let capturedBody: any;
    setMockFetch(async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ emailId: "provider_cc_strip" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Test CC",
      html: "<p>Hi</p>",
      cc: [{ email: "cc@example.com" }],
      bcc: [{ email: "bcc@example.com" }],
    });

    await t.action("queue:processQueue", {});

    expect(capturedBody.to.email).toBe("sandbox@example.com");
    expect(capturedBody.cc).toBeUndefined();
    expect(capturedBody.bcc).toBeUndefined();
  });

  test("attachment with fileUrl instead of content", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        autosendApiKey: "as_test_key",
        defaultFrom: "noreply@example.com",
      },
    });

    let capturedBody: any;
    setMockFetch(async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ emailId: "provider_url_att" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Attachment Test",
      html: "<p>See attached</p>",
      attachments: [
        {
          filename: "report.pdf",
          fileUrl: "https://cdn.example.com/report.pdf",
          contentType: "application/pdf",
          description: "Monthly report",
        },
      ],
    });

    await t.action("queue:processQueue", {});

    expect(capturedBody.attachments[0].fileName).toBe("report.pdf");
    expect(capturedBody.attachments[0].fileUrl).toBe("https://cdn.example.com/report.pdf");
    expect(capturedBody.attachments[0].content).toBeUndefined();
    expect(capturedBody.attachments[0].description).toBe("Monthly report");
  });

  test("attachment requires either content or fileUrl", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: { testMode: false, defaultFrom: "noreply@example.com" },
    });

    await expect(
      t.mutation("emails:sendEmail", {
        to: ["user@example.com"],
        subject: "Bad Attachment",
        html: "<p>Hi</p>",
        attachments: [{ filename: "file.txt" }],
      }),
    ).rejects.toThrow(/requires either content.*or fileUrl/);
  });

  test("different CC produces different idempotency hash", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: { testMode: false, defaultFrom: "noreply@example.com" },
    });

    const first = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Same subject",
      html: "<p>Hi</p>",
    });

    const second = await t.mutation("emails:sendEmail", {
      to: ["user@example.com"],
      subject: "Same subject",
      html: "<p>Hi</p>",
      cc: [{ email: "cc@example.com" }],
    });

    expect(first.emailId).not.toBe(second.emailId);
    expect(second.deduped).toBe(false);
  });

  test("config merge and replace semantics", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        testMode: false,
        defaultFrom: "one@example.com",
        rateLimitRps: 5,
      },
    });

    await t.mutation("config:setConfig", {
      config: {
        rateLimitRps: 7,
      },
    });

    let config = await t.query("config:getConfig", {});
    expect(config.testMode).toBe(false);
    expect(config.defaultFrom).toBe("one@example.com");
    expect(config.rateLimitRps).toBe(7);

    await t.mutation("config:setConfig", {
      config: {
        defaultFrom: "two@example.com",
      },
      replace: true,
    });

    config = await t.query("config:getConfig", {});
    expect(config.defaultFrom).toBe("two@example.com");
    expect(config.testMode).toBe(true);
  });
});
