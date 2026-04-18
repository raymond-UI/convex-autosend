"use client";

import { CircleDot, RefreshCw, Trash2, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { QueueResult } from "./shared";

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "\u2014";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

export function OpsView({
  onProcessQueue,
  onDryRunCleanup,
  onExecuteCleanupOld,
  onExecuteCleanupAbandoned,
  onCleanupDeliveries,
  processing,
  cleanupRunning,
  queueResult,
  emailCounts,
  config,
  dryRunOldResult,
  dryRunAbandonedResult,
  cleanupOldResult,
  cleanupAbandonedResult,
  cleanupDeliveryResult,
}: {
  onProcessQueue: () => void;
  onDryRunCleanup: () => void;
  onExecuteCleanupOld: () => void;
  onExecuteCleanupAbandoned: () => void;
  onCleanupDeliveries: () => void;
  processing: boolean;
  cleanupRunning: boolean;
  queueResult: QueueResult | null;
  emailCounts: Record<string, number>;
  config: any;
  dryRunOldResult: any;
  dryRunAbandonedResult: any;
  cleanupOldResult: any;
  cleanupAbandonedResult: any;
  cleanupDeliveryResult: any;
}) {
  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Delivery Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {(
              [
                ["Total", emailCounts.total, null],
                ["Queued", emailCounts.queued, "text-violet-600 dark:text-violet-400"],
                ["Sending", emailCounts.sending, "text-sky-600 dark:text-sky-400"],
                ["Sent", emailCounts.sent, "text-emerald-600 dark:text-emerald-400"],
                ["Failed", emailCounts.failed, "text-red-600 dark:text-red-400"],
                ["Retrying", emailCounts.retrying, "text-amber-600 dark:text-amber-400"],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label}>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums mt-0.5",
                    color ?? "text-zinc-900 dark:text-zinc-100",
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Queue runner */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              Queue Runner
            </CardTitle>
            <CardDescription>
              Dispatch queued and retrying jobs through the provider adapter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={onProcessQueue} disabled={processing}>
              <Zap className="size-3.5" />
              {processing ? "Processing\u2026" : "Process Queue Now"}
            </Button>

            {queueResult && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2 animate-fade-in">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Processed</span>
                    <span className="font-medium tabular-nums">{queueResult.processedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Sent</span>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {queueResult.sentCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Retried</span>
                    <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                      {queueResult.retriedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Failed</span>
                    <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                      {queueResult.failedCount}
                    </span>
                  </div>
                </div>
                {queueResult.hasMoreDue && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <CircleDot className="size-3" />
                    More items due \u2014 run again
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maintenance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="size-4 text-sky-500" />
              Maintenance
            </CardTitle>
            <CardDescription>
              Preview cleanup impact or execute immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onDryRunCleanup} disabled={cleanupRunning}>
                {cleanupRunning ? "Running\u2026" : "Dry-Run Preview"}
              </Button>
              <Button
                variant="destructive"
                onClick={onExecuteCleanupOld}
                disabled={cleanupRunning}
              >
                <Trash2 className="size-3.5" />
                Delete Old Emails
              </Button>
              <Button
                variant="outline"
                onClick={onExecuteCleanupAbandoned}
                disabled={cleanupRunning}
              >
                <RefreshCw className="size-3.5" />
                Recover Abandoned
              </Button>
              <Button
                variant="outline"
                onClick={onCleanupDeliveries}
                disabled={cleanupRunning}
              >
                <Trash2 className="size-3.5" />
                Prune Deliveries
              </Button>
            </div>

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Cleanup Thresholds (read-only)
              </p>
              <div className="text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Old terminal emails</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {formatDuration(config?.cleanupOldEmailsMs)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Abandoned sending</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {formatDuration(config?.cleanupAbandonedMs)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Webhook deliveries</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {formatDuration(config?.cleanupDeliveriesMs)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Cleanup batch size</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {config?.cleanupBatchSize ?? "\u2014"}
                  </span>
                </div>
              </div>
            </div>

            {/* Dry-run preview results */}
            {(dryRunOldResult || dryRunAbandonedResult) && (
              <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-3 space-y-2 animate-fade-in">
                <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
                  Dry-Run Preview
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {dryRunOldResult && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Old emails</span>
                      <span className="font-medium tabular-nums">{dryRunOldResult.emailIds.length}</span>
                    </div>
                  )}
                  {dryRunAbandonedResult && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Abandoned</span>
                      <span className="font-medium tabular-nums">{dryRunAbandonedResult.emailIds.length}</span>
                    </div>
                  )}
                </div>
                {dryRunOldResult?.emailIds?.length > 0 && (
                  <div className="text-xs">
                    <p className="text-zinc-500 dark:text-zinc-400 mb-1">Old email IDs:</p>
                    <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 max-h-20 overflow-auto">
                      {dryRunOldResult.emailIds.join(", ")}
                    </div>
                  </div>
                )}
                {dryRunAbandonedResult?.emailIds?.length > 0 && (
                  <div className="text-xs">
                    <p className="text-zinc-500 dark:text-zinc-400 mb-1">Abandoned email IDs:</p>
                    <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 max-h-20 overflow-auto">
                      {dryRunAbandonedResult.emailIds.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            )}

            {cleanupOldResult && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2 animate-fade-in">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Old Email Cleanup Result</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Deleted</span>
                    <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{cleanupOldResult.deletedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Scanned</span>
                    <span className="font-medium tabular-nums">{cleanupOldResult.emailIds?.length ?? 0}</span>
                  </div>
                </div>
                {cleanupOldResult.hasMore && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <CircleDot className="size-3" />
                    More remaining — run again
                  </p>
                )}
              </div>
            )}

            {cleanupAbandonedResult && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2 animate-fade-in">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Abandoned Recovery Result</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Recovered</span>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{cleanupAbandonedResult.recoveredCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Scanned</span>
                    <span className="font-medium tabular-nums">{cleanupAbandonedResult.emailIds?.length ?? 0}</span>
                  </div>
                </div>
                {cleanupAbandonedResult.hasMore && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <CircleDot className="size-3" />
                    More remaining — run again
                  </p>
                )}
              </div>
            )}

            {cleanupDeliveryResult && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2 animate-fade-in">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Webhook Delivery Cleanup Result</p>
                <div className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Deleted</span>
                    <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{cleanupDeliveryResult.deletedCount}</span>
                  </div>
                </div>
                {cleanupDeliveryResult.hasMore && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                    <CircleDot className="size-3" />
                    More remaining — run again
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Runtime params */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Runtime Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(
              [
                ["Rate Limit", `${config?.rateLimitRps ?? "\u2014"} rps`],
                ["Max Attempts", config?.maxAttempts ?? "\u2014"],
                ["Batch Size", config?.sendBatchSize ?? "\u2014"],
                ["Compatibility", config?.providerCompatibilityMode ?? "\u2014"],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
