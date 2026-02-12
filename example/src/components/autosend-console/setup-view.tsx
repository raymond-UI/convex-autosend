"use client";

import { toast } from "sonner";
import { CircleDot, Inbox, Key, Settings2, Shield } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function SetupView({
  config,
  inboxes,
  defaultFrom,
  setDefaultFrom,
  defaultReplyTo,
  setDefaultReplyTo,
  sandboxTo,
  setSandboxTo,
  testMode,
  onToggleTestMode,
  providerCompatibilityMode,
  setProviderCompatibilityMode,
  onSyncSecrets,
  onSaveConfig,
}: {
  config: any;
  inboxes: any[] | undefined;
  defaultFrom: string;
  setDefaultFrom: (v: string) => void;
  defaultReplyTo: string;
  setDefaultReplyTo: (v: string) => void;
  sandboxTo: string;
  setSandboxTo: (v: string) => void;
  testMode: boolean;
  onToggleTestMode: (v: boolean) => void;
  providerCompatibilityMode: "strict" | "lenient";
  setProviderCompatibilityMode: (v: "strict" | "lenient") => void;
  onSyncSecrets: () => void;
  onSaveConfig: () => void;
}) {
  return (
    <div className="p-5 sm:p-8 max-w-2xl mx-auto space-y-6">
      {/* Secrets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="size-4 text-amber-500" />
            Environment Secrets
          </CardTitle>
          <CardDescription>
            Synced server-side from Convex environment variables.
            Expected: <code className="text-zinc-700 dark:text-zinc-300">AUTOSEND_API_KEY</code>{" "}
            and <code className="text-zinc-700 dark:text-zinc-300">AUTOSEND_WEBHOOK_SECRET</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  config?.hasApiKey ? "bg-emerald-500" : "bg-red-500 animate-pulse-soft",
                )}
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">API Key</span>
              {config?.hasApiKey ? (
                <Badge variant="success" className="text-[10px]">Active</Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">Missing</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  config?.hasWebhookSecret ? "bg-emerald-500" : "bg-red-500 animate-pulse-soft",
                )}
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Webhook Secret</span>
              {config?.hasWebhookSecret ? (
                <Badge variant="success" className="text-[10px]">Active</Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">Missing</Badge>
              )}
            </div>
          </div>

          <Button variant="outline" onClick={onSyncSecrets}>
            <Shield className="size-3.5" />
            Sync Secrets From Env
          </Button>
        </CardContent>
      </Card>

      {/* Runtime config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="size-4 text-sky-500" />
            Runtime Settings
          </CardTitle>
          <CardDescription>
            Non-sensitive controls. Changes apply immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Default From</Label>
              <Input
                value={defaultFrom}
                onChange={(e) => setDefaultFrom(e.target.value)}
                placeholder="noreply@example.com"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Reply-To</Label>
              <Input
                value={defaultReplyTo}
                onChange={(e) => setDefaultReplyTo(e.target.value)}
                placeholder="support@example.com"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Sandbox Recipients (comma separated)</Label>
                {inboxes && inboxes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300"
                    onClick={() => {
                      const addresses = inboxes.map((i) => i.address).join(", ");
                      setSandboxTo(addresses);
                      toast.success(`Populated ${inboxes.length} Mail.tm address${inboxes.length > 1 ? "es" : ""}`);
                    }}
                  >
                    <Inbox className="size-3" />
                    Use Mail.tm inboxes
                  </Button>
                )}
              </div>
              <Input
                value={sandboxTo}
                onChange={(e) => setSandboxTo(e.target.value)}
                placeholder="qa1@mail.tm, qa2@mail.tm"
                className="font-mono text-xs"
              />
              {testMode && !sandboxTo.trim() && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <CircleDot className="size-3" />
                  Test mode requires at least one sandbox recipient
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => onToggleTestMode(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="text-zinc-700 dark:text-zinc-300">Test Mode</span>
              {testMode && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  ACTIVE \u2014 all emails redirect to sandbox
                </span>
              )}
            </label>

            <div className="flex items-center gap-2 text-sm">
              <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                Compatibility
              </Label>
              <select
                value={providerCompatibilityMode}
                onChange={(e) =>
                  setProviderCompatibilityMode(e.target.value as "strict" | "lenient")
                }
                className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="strict">Strict</option>
                <option value="lenient">Lenient</option>
              </select>
            </div>
          </div>

          <Button onClick={onSaveConfig}>
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Read-only defaults */}
      <Card className="opacity-60">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-zinc-500 dark:text-zinc-400">
            Defaults (read-only)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Rate Limit</p>
              <p className="font-medium text-zinc-700 dark:text-zinc-300 mt-0.5">
                {config?.rateLimitRps ?? "\u2014"} rps
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Max Attempts</p>
              <p className="font-medium text-zinc-700 dark:text-zinc-300 mt-0.5">
                {config?.maxAttempts ?? "\u2014"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Batch Size</p>
              <p className="font-medium text-zinc-700 dark:text-zinc-300 mt-0.5">
                {config?.sendBatchSize ?? "\u2014"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
