import { httpActionGeneric } from "convex/server";
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpRouter,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

export type { ComponentApi } from "../component/_generated/component.js";
export type {
  Attachment,
  ConfigUpdate,
  EmailRecipient,
  EmailStatus,
  ProviderCompatibilityMode,
  SafeConfig,
  SendBulkArgs,
  SendEmailArgs,
} from "../component/types.js";
export {
  abandonedCleanupResultValidator,
  attachmentValidator,
  cancelResultValidator,
  cleanupResultValidator,
  configUpdateValidator,
  emailRecipientValidator,
  emailStatusValidator,
  processQueueResultValidator,
  providerCompatibilityModeValidator,
  safeConfigValidator,
  sendBulkArgsValidator,
  sendBulkResultValidator,
  sendEmailArgsValidator,
  sendResultValidator,
  webhookHandleResultValidator,
} from "../component/types.js";

type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

export class AutoSend {
  public component: ComponentApi;

  constructor(component: ComponentApi) {
    this.component = component;
  }

  async sendEmail(
    ctx: MutationCtx,
    args: {
      to: string[];
      toName?: string;
      from?: string;
      fromName?: string;
      replyTo?: string;
      replyToName?: string;
      cc?: Array<{ email: string; name?: string }>;
      bcc?: Array<{ email: string; name?: string }>;
      subject?: string;
      html?: string;
      text?: string;
      templateId?: string;
      dynamicData?: unknown;
      attachments?: Array<{
        filename: string;
        content?: string;
        fileUrl?: string;
        contentType?: string;
        disposition?: string;
        description?: string;
      }>;
      metadata?: unknown;
      idempotencyKey?: string;
      unsubscribeGroupId?: string;
    },
  ) {
    return await ctx.runMutation(this.component.emails.sendEmail, args);
  }

  async sendBulk(
    ctx: MutationCtx,
    args: {
      recipients: string[];
      from?: string;
      fromName?: string;
      replyTo?: string;
      replyToName?: string;
      cc?: Array<{ email: string; name?: string }>;
      bcc?: Array<{ email: string; name?: string }>;
      subject?: string;
      html?: string;
      text?: string;
      templateId?: string;
      dynamicData?: unknown;
      attachments?: Array<{
        filename: string;
        content?: string;
        fileUrl?: string;
        contentType?: string;
        disposition?: string;
        description?: string;
      }>;
      metadata?: unknown;
      idempotencyKeyPrefix?: string;
      unsubscribeGroupId?: string;
    },
  ) {
    return await ctx.runMutation(this.component.emails.sendBulk, args);
  }

  async status(ctx: QueryCtx, args: { emailId: string }) {
    return await ctx.runQuery(this.component.queries.status, args);
  }

  async listEvents(
    ctx: QueryCtx,
    args: { emailId: string; limit?: number },
  ) {
    return await ctx.runQuery(this.component.queries.listEvents, args);
  }

  async cancelEmail(ctx: MutationCtx, args: { emailId: string }) {
    return await ctx.runMutation(this.component.emails.cancelEmail, args);
  }

  async setConfig(
    ctx: MutationCtx,
    args: {
      config: {
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
      replace?: boolean;
    },
  ) {
    return await ctx.runMutation(this.component.config.setConfig, args);
  }

  async getConfig(ctx: QueryCtx) {
    return await ctx.runQuery(this.component.config.getConfig, {});
  }

  async processQueue(
    ctx: ActionCtx,
    args: {
      batchSize?: number;
    } = {},
  ) {
    return await ctx.runAction(this.component.queue.processQueue, args);
  }

  async cleanupOldEmails(
    ctx: ActionCtx,
    args: {
      olderThanMs?: number;
      batchSize?: number;
      dryRun?: boolean;
    } = {},
  ) {
    return await ctx.runAction(this.component.cleanup.cleanupOldEmails, args);
  }

  async cleanupAbandonedEmails(
    ctx: ActionCtx,
    args: {
      staleAfterMs?: number;
      batchSize?: number;
      dryRun?: boolean;
    } = {},
  ) {
    return await ctx.runAction(this.component.cleanup.cleanupAbandonedEmails, args);
  }

  async handleCallback(
    ctx: ActionCtx,
    args: {
      rawBody: string;
      signature: string;
      event: string;
      deliveryId: string;
      timestamp: string;
      webhookSecret?: string;
    },
  ) {
    return await ctx.runAction(this.component.webhooks.handleCallback, args);
  }
}

export function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  options: {
    path?: string;
    webhookSecret?: string;
  } = {},
) {
  const path = options.path ?? "/webhooks/autosend";

  http.route({
    path,
    method: "POST",
    handler: httpActionGeneric(async (ctx, request) => {
      const signature = request.headers.get("x-webhook-signature");
      const event = request.headers.get("x-webhook-event");
      const deliveryId = request.headers.get("x-webhook-delivery-id");
      const timestamp = request.headers.get("x-webhook-timestamp");

      if (!signature || !event || !deliveryId || !timestamp) {
        return new Response("Missing webhook headers", { status: 400 });
      }

      const rawBody = await request.text();

      const result = await ctx.runAction(component.webhooks.handleCallback, {
        rawBody,
        signature,
        event,
        deliveryId,
        timestamp,
        webhookSecret: options.webhookSecret,
      });

      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("ok", { status: 200 });
    }),
  });
}
