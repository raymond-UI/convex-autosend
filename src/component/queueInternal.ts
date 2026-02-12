import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { sendOne, type ProviderSendPayload } from "./provider";
import { processQueueResultValidator, type ProcessQueueResult } from "./types";
import { internal } from "./_generated/api";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function buildProviderPayload(params: {
  email: {
    to: string[];
    from: string;
    replyTo?: string;
    subject?: string;
    html?: string;
    text?: string;
    templateId?: string;
    dynamicData?: unknown;
    attachments?: unknown;
    metadata?: unknown;
  };
  globals: {
    testMode: boolean;
    sandboxTo: string[];
  };
}): ProviderSendPayload | { error: string } {
  const email = params.email;
  let to = email.to;
  let metadata = email.metadata;

  if (params.globals.testMode) {
    if (params.globals.sandboxTo.length === 0) {
      return {
        error:
          "testMode is enabled but sandboxTo is empty. Configure sandboxTo or disable testMode.",
      };
    }
    to = params.globals.sandboxTo;
    metadata = {
      ...asObject(email.metadata),
      autosendOriginalTo: email.to,
    };
  }

  return {
    to,
    from: email.from,
    replyTo: email.replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
    templateId: email.templateId,
    dynamicData: email.dynamicData,
    attachments: email.attachments as any,
    metadata,
  };
}

export const processDueQueue = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: processQueueResultValidator,
  handler: async (ctx, args): Promise<ProcessQueueResult> => {
    const globals = await ctx.runQuery(internal.config.getGlobalsInternal, {});

    const requestedBatchSize = args.batchSize ?? globals.sendBatchSize;
    const limitedByBatch = Math.max(1, Math.min(requestedBatchSize, globals.sendBatchSize));
    const perRunLimit = Math.max(1, Math.min(limitedByBatch, globals.rateLimitRps));

    const now = Date.now();
    const [queued, retrying] = await Promise.all([
      ctx.runQuery(internal.queries.dueByStatus, {
        status: "queued",
        now,
        limit: perRunLimit,
      }),
      ctx.runQuery(internal.queries.dueByStatus, {
        status: "retrying",
        now,
        limit: perRunLimit,
      }),
    ]);

    const due = [...queued, ...retrying]
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
      .slice(0, perRunLimit);

    let processedCount = 0;
    let sentCount = 0;
    let retriedCount = 0;
    let failedCount = 0;

    for (const candidate of due) {
      // claimQueuedEmail is an atomic mutation that checks the email is still
      // in a claimable state (queued/retrying) before transitioning to "sending".
      // Convex serializable mutations guarantee that concurrent claims on the
      // same email are linearized — only one will succeed, preventing duplicate sends.
      const claimed = await ctx.runMutation(internal.emails.claimQueuedEmail, {
        emailId: candidate.emailId,
        now: Date.now(),
      });
      if (!claimed) continue;

      processedCount += 1;

      // Wrap per-email processing in try-catch so that an unhandled exception
      // after claiming doesn't leave the email permanently stuck in "sending".
      try {
        const payload = buildProviderPayload({
          email: claimed,
          globals,
        });

        if ("error" in payload) {
          await ctx.runMutation(internal.emails.markSendFailure, {
            emailId: claimed.emailId,
            error: payload.error,
            retryable: false,
            now: Date.now(),
          });
          failedCount += 1;
          continue;
        }

        if (!globals.autosendApiKey) {
          await ctx.runMutation(internal.emails.markSendFailure, {
            emailId: claimed.emailId,
            error: "AutoSend API key is not configured.",
            retryable: false,
            now: Date.now(),
          });
          failedCount += 1;
          continue;
        }

        const result = await sendOne(payload, {
          apiKey: globals.autosendApiKey,
          baseUrl: globals.autosendBaseUrl,
          compatibilityMode: globals.providerCompatibilityMode,
        });

        if (result.ok) {
          await ctx.runMutation(internal.emails.markSendSuccess, {
            emailId: claimed.emailId,
            providerMessageId: result.providerMessageId,
            providerStatus: result.providerStatus,
            now: Date.now(),
          });
          sentCount += 1;
          continue;
        }

        const delayIndex = Math.min(
          claimed.attemptCount,
          Math.max(0, globals.retryDelaysMs.length - 1),
        );
        const nextAttemptAt =
          result.retryable && globals.retryDelaysMs.length > 0
            ? Date.now() + globals.retryDelaysMs[delayIndex]!
            : undefined;

        const failureStatus = await ctx.runMutation(internal.emails.markSendFailure, {
          emailId: claimed.emailId,
          error: result.error,
          retryable: result.retryable,
          nextAttemptAt,
          now: Date.now(),
        });

        if (failureStatus === "retrying") {
          retriedCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (error: unknown) {
        // If anything unexpected goes wrong after claiming, mark the email as
        // retryable so it re-enters the queue instead of staying stuck in "sending".
        const errorMsg =
          error instanceof Error ? error.message : "Unexpected error during send processing";
        try {
          const delayIndex = Math.min(
            claimed.attemptCount,
            Math.max(0, globals.retryDelaysMs.length - 1),
          );
          const retryDelay =
            globals.retryDelaysMs.length > 0
              ? globals.retryDelaysMs[delayIndex]!
              : 30_000;

          const failureStatus = await ctx.runMutation(internal.emails.markSendFailure, {
            emailId: claimed.emailId,
            error: errorMsg,
            retryable: true,
            nextAttemptAt: Date.now() + retryDelay,
            now: Date.now(),
          });

          if (failureStatus === "retrying") {
            retriedCount += 1;
          } else {
            failedCount += 1;
          }
        } catch {
          // If even markSendFailure fails, the abandoned email recovery cron
          // will eventually reclaim this email from "sending" state.
          failedCount += 1;
        }
      }
    }

    const hasMoreDue: boolean = await ctx.runQuery(internal.queries.hasAnyDue, {
      now: Date.now(),
    });

    return {
      processedCount,
      sentCount,
      retriedCount,
      failedCount,
      hasMoreDue,
    };
  },
});
