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

export function OpsView({
  onProcessQueue,
  onDryRunCleanup,
  onExecuteCleanupOld,
  onExecuteCleanupAbandoned,
  processing,
  queueResult,
  emailCounts,
  config,
  cleanupOldResult,
  cleanupAbandonedResult,
}: {
  onProcessQueue: () => void;
  onDryRunCleanup: () => void;
  onExecuteCleanupOld: () => void;
  onExecuteCleanupAbandoned: () => void;
  processing: boolean;
  queueResult: QueueResult | null;
  emailCounts: Record<string, number>;
  config: any;
  cleanupOldResult: any;
  cleanupAbandonedResult: any;
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
              <Button variant="outline" onClick={onDryRunCleanup}>
                Dry-Run Preview
              </Button>
              <Button
                variant="destructive"
                onClick={onExecuteCleanupOld}
              >
                <Trash2 className="size-3.5" />
                Delete Old Emails
              </Button>
              <Button
                variant="outline"
                onClick={onExecuteCleanupAbandoned}
              >
                <RefreshCw className="size-3.5" />
                Recover Abandoned
              </Button>
            </div>

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Cleanup Thresholds
              </p>
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Old terminal emails</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">7 days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Abandoned sending</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">15 minutes</span>
                </div>
              </div>
            </div>

            {cleanupOldResult && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2 animate-fade-in">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Old Email Cleanup Result</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Deleted</span>
                    <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{cleanupOldResult.deletedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Affected</span>
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
                    <span className="text-zinc-500 dark:text-zinc-400">Affected</span>
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
