"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Send,
  Inbox,
  Settings2,
  Activity,
  CircleDot,
  RefreshCw,
  Trash2,
  Plus,
  Zap,
  Shield,
  Key,
  Mail,
  X,
  ChevronRight,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type View = "send" | "inbox" | "ops" | "setup";

type QueueResult = {
  processedCount: number;
  sentCount: number;
  retriedCount: number;
  failedCount: number;
  hasMoreDue: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeVariant(status?: string) {
  switch (status) {
    case "sent":
      return "success" as const;
    case "failed":
      return "destructive" as const;
    case "retrying":
      return "warning" as const;
    case "sending":
      return "info" as const;
    case "canceled":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function StatusIndicator({ status }: { status?: string }) {
  const colors: Record<string, string> = {
    sent: "bg-emerald-500",
    failed: "bg-red-500",
    retrying: "bg-amber-500",
    sending: "bg-sky-500",
    canceled: "bg-zinc-400",
    queued: "bg-violet-500",
  };
  const s = status ?? "queued";
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full",
        colors[s] ?? "bg-violet-500",
        (s === "sending" || s === "retrying") && "animate-pulse-soft",
      )}
    />
  );
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

// ---------------------------------------------------------------------------
// Main console
// ---------------------------------------------------------------------------

export default function AutoSendConsole() {
  const [view, setView] = useState<View>("send");

  // Data
  const config = useQuery(api.autosendDemo.getConfig, {});
  const demoEmails = useQuery(api.autosendDemo.listDemoEmails, { limit: 50 });
  const inboxes = useQuery(api.mailtm.listInboxes, {});
  const [selectedInboxId, setSelectedInboxId] = useState<Id<"mailtmInboxes"> | null>(null);
  const messages = useQuery(
    api.mailtm.listMessages,
    selectedInboxId ? { inboxId: selectedInboxId, limit: 100 } : "skip",
  );
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  // Mutations / Actions
  const syncSecretsFromEnv = useAction(api.envSetup.syncSecretsFromEnv);
  const setConfig = useMutation(api.autosendDemo.setConfig);
  const sendEmail = useMutation(api.autosendDemo.sendEmail);
  const sendBulk = useMutation(api.autosendDemo.sendBulk);
  const cancelEmail = useMutation(api.autosendDemo.cancelEmail);
  const processQueue = useAction(api.autosendDemo.processQueue);
  const cleanupOldEmails = useAction(api.autosendDemo.cleanupOldEmails);
  const cleanupAbandonedEmails = useAction(api.autosendDemo.cleanupAbandonedEmails);
  const createInbox = useAction(api.mailtm.createInbox);
  const syncInbox = useAction(api.mailtm.syncInbox);
  const fetchMessage = useAction(api.mailtm.fetchMessage);
  const deleteInbox = useMutation(api.mailtm.deleteInbox);

  // Form state — setup
  const [defaultFrom, setDefaultFrom] = useState("");
  const [defaultReplyTo, setDefaultReplyTo] = useState("");
  const [sandboxTo, setSandboxTo] = useState("");
  const [testMode, setTestMode] = useState(true);
  const [providerCompatibilityMode, setProviderCompatibilityMode] = useState<
    "strict" | "lenient"
  >("strict");
  const [fromConfigHydrated, setFromConfigHydrated] = useState(false);

  // Form state — send
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Welcome to AutoSend");
  const [html, setHtml] = useState(
    "<h2>Welcome</h2><p>Your account setup is complete.</p>",
  );
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [bulkRecipients, setBulkRecipients] = useState("");
  const [idempotencyPrefix, setIdempotencyPrefix] = useState("");
  const [sendMode, setSendMode] = useState<"single" | "bulk">("single");

  // Form state — inbox
  const [inboxLabel, setInboxLabel] = useState("QA Inbox");

  // Ops
  const [queueResult, setQueueResult] = useState<QueueResult | null>(null);
  const [processing, setProcessing] = useState(false);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!config || fromConfigHydrated) return;
    setDefaultFrom(config.defaultFrom ?? "");
    setDefaultReplyTo(config.defaultReplyTo ?? "");
    setSandboxTo(config.sandboxTo.join(", "));
    setTestMode(config.testMode);
    setProviderCompatibilityMode(config.providerCompatibilityMode);
    setFromConfigHydrated(true);
  }, [config, fromConfigHydrated]);

  useEffect(() => {
    if (!inboxes || inboxes.length === 0) {
      setSelectedInboxId(null);
      return;
    }
    if (!selectedInboxId) {
      setSelectedInboxId(inboxes[0]!._id);
      if (!to) setTo(inboxes[0]!.address);
      return;
    }
    if (!inboxes.some((inbox) => inbox._id === selectedInboxId)) {
      setSelectedInboxId(inboxes[0]!._id);
      setTo(inboxes[0]!.address);
    }
  }, [inboxes, selectedInboxId, to]);

  const selectedMessage = useMemo(
    () => messages?.find((m) => m.messageId === selectedMessageId) ?? null,
    [messages, selectedMessageId],
  );

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const emailCounts = useMemo(() => {
    if (!demoEmails)
      return { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, retrying: 0, canceled: 0 };
    const counts = {
      total: demoEmails.length,
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      retrying: 0,
      canceled: 0,
    };
    for (const e of demoEmails) {
      const s = (e.status?.status ?? "queued") as keyof typeof counts;
      if (s in counts) counts[s]++;
    }
    return counts;
  }, [demoEmails]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const onSyncSecrets = useCallback(async () => {
    try {
      const result = await syncSecretsFromEnv({});
      toast.success(
        `Secrets synced \u2014 API Key: ${result.hasApiKey ? "yes" : "no"}, Webhook: ${result.hasWebhookSecret ? "yes" : "no"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync secrets");
    }
  }, [syncSecretsFromEnv]);

  const onSaveConfig = useCallback(async () => {
    try {
      await setConfig({
        defaultFrom: defaultFrom.trim() || undefined,
        defaultReplyTo: defaultReplyTo.trim() || undefined,
        sandboxTo: sandboxTo
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        testMode,
        providerCompatibilityMode,
      });
      toast.success("Config saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save config");
    }
  }, [setConfig, defaultFrom, defaultReplyTo, sandboxTo, testMode, providerCompatibilityMode]);

  const onQueueSingle = useCallback(async () => {
    if (!to.trim()) {
      toast.error("Recipient required");
      return;
    }
    try {
      const result = await sendEmail({
        to: to.trim(),
        subject,
        html,
        idempotencyKey: idempotencyKey.trim() || undefined,
      });
      toast.success(
        result.deduped ? `Deduped \u2014 ${result.emailId}` : `Queued \u2014 ${result.emailId}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Queue failed");
    }
  }, [sendEmail, to, subject, html, idempotencyKey]);

  const onQueueBulk = useCallback(async () => {
    const recipients = Array.from(
      new Set(
        bulkRecipients
          .split(/[\n,]/g)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    );
    if (recipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }
    try {
      const result = await sendBulk({
        recipients,
        subject,
        html,
        idempotencyKeyPrefix: idempotencyPrefix.trim() || undefined,
      });
      toast.success(`Queued ${result.acceptedCount} emails`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk queue failed");
    }
  }, [sendBulk, bulkRecipients, subject, html, idempotencyPrefix]);

  const onProcessQueue = useCallback(async () => {
    setProcessing(true);
    try {
      const result = await processQueue({});
      setQueueResult(result);
      toast.success(`Processed ${result.processedCount} \u2014 sent ${result.sentCount}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Queue failed");
    } finally {
      setProcessing(false);
    }
  }, [processQueue]);

  const onDryRunCleanup = useCallback(async () => {
    try {
      const [oldResult, abandonedResult] = await Promise.all([
        cleanupOldEmails({ dryRun: true, olderThanMs: 7 * 24 * 60 * 60 * 1000 }),
        cleanupAbandonedEmails({ dryRun: true, staleAfterMs: 15 * 60 * 1000 }),
      ]);
      toast.success(
        `Dry-run: ${oldResult.emailIds.length} old, ${abandonedResult.emailIds.length} abandoned`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    }
  }, [cleanupOldEmails, cleanupAbandonedEmails]);

  const onCreateInbox = useCallback(async () => {
    try {
      const result = await createInbox({ label: inboxLabel.trim() || undefined });
      setSelectedInboxId(result.inboxId as Id<"mailtmInboxes">);
      setTo(result.address);
      setBulkRecipients((prev) =>
        prev.trim() ? `${prev}\n${result.address}` : result.address,
      );
      toast.success(`Created ${result.address}`);
      await syncInbox({ inboxId: result.inboxId as Id<"mailtmInboxes"> });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inbox creation failed");
    }
  }, [createInbox, inboxLabel, syncInbox]);

  const onSyncInbox = useCallback(
    async (inboxId: Id<"mailtmInboxes">) => {
      try {
        const result = await syncInbox({ inboxId });
        toast.success(`Synced ${result.syncedCount} messages`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Sync failed");
      }
    },
    [syncInbox],
  );

  const onDeleteInbox = useCallback(
    async (inboxId: Id<"mailtmInboxes">) => {
      try {
        await deleteInbox({ inboxId });
        toast.success("Inbox deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [deleteInbox],
  );

  const onOpenMessage = useCallback(
    async (messageId: string) => {
      if (!selectedInboxId) return;
      try {
        await fetchMessage({ inboxId: selectedInboxId, messageId });
        setSelectedMessageId(messageId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load");
      }
    },
    [fetchMessage, selectedInboxId],
  );

  const onCancel = useCallback(
    async (emailId: string) => {
      try {
        const result = await cancelEmail({ emailId });
        toast.success(result.canceled ? "Canceled" : "Cannot cancel \u2014 already terminal");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Cancel failed");
      }
    },
    [cancelEmail],
  );

  // ---------------------------------------------------------------------------
  // Nav items
  // ---------------------------------------------------------------------------

  const NAV: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: "send", label: "Send & Monitor", icon: <Send className="size-4" /> },
    { key: "inbox", label: "Test Inbox", icon: <Inbox className="size-4" /> },
    { key: "ops", label: "Operations", icon: <Activity className="size-4" /> },
    { key: "setup", label: "Configuration", icon: <Settings2 className="size-4" /> },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-svh overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
                <Mail className="size-3.5 text-white dark:text-zinc-900" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
                  AutoSend
                </h1>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5">
                  Mission Control
                </p>
              </div>
            </div>

            {config?.testMode && (
              <Badge variant="warning" className="text-[10px] ml-1">
                Test Mode
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  config?.hasApiKey ? "bg-emerald-500" : "bg-red-500 animate-pulse-soft",
                )}
              />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:inline">
                API Key
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  config?.hasWebhookSecret
                    ? "bg-emerald-500"
                    : "bg-red-500 animate-pulse-soft",
                )}
              />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:inline">
                Webhook
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex px-4 sm:px-6 gap-1 -mb-px overflow-x-auto">
          {NAV.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer rounded-t-md",
                view === key
                  ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-zinc-900 dark:border-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 border-b-2 border-transparent",
              )}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {view === "send" && (
          <SendView
            to={to}
            setTo={setTo}
            subject={subject}
            setSubject={setSubject}
            html={html}
            setHtml={setHtml}
            idempotencyKey={idempotencyKey}
            setIdempotencyKey={setIdempotencyKey}
            bulkRecipients={bulkRecipients}
            setBulkRecipients={setBulkRecipients}
            idempotencyPrefix={idempotencyPrefix}
            setIdempotencyPrefix={setIdempotencyPrefix}
            sendMode={sendMode}
            setSendMode={setSendMode}
            onQueueSingle={onQueueSingle}
            onQueueBulk={onQueueBulk}
            onProcessQueue={onProcessQueue}
            processing={processing}
            demoEmails={demoEmails}
            emailCounts={emailCounts}
            onCancel={onCancel}
          />
        )}
        {view === "inbox" && (
          <InboxView
            inboxes={inboxes}
            selectedInboxId={selectedInboxId}
            setSelectedInboxId={setSelectedInboxId}
            setTo={setTo}
            messages={messages}
            selectedMessage={selectedMessage}
            selectedMessageId={selectedMessageId}
            inboxLabel={inboxLabel}
            setInboxLabel={setInboxLabel}
            onCreateInbox={onCreateInbox}
            onSyncInbox={onSyncInbox}
            onDeleteInbox={onDeleteInbox}
            onOpenMessage={onOpenMessage}
          />
        )}
        {view === "ops" && (
          <OpsView
            onProcessQueue={onProcessQueue}
            onDryRunCleanup={onDryRunCleanup}
            processing={processing}
            queueResult={queueResult}
            emailCounts={emailCounts}
            config={config}
          />
        )}
        {view === "setup" && (
          <SetupView
            config={config}
            inboxes={inboxes}
            defaultFrom={defaultFrom}
            setDefaultFrom={setDefaultFrom}
            defaultReplyTo={defaultReplyTo}
            setDefaultReplyTo={setDefaultReplyTo}
            sandboxTo={sandboxTo}
            setSandboxTo={setSandboxTo}
            testMode={testMode}
            setTestMode={setTestMode}
            providerCompatibilityMode={providerCompatibilityMode}
            setProviderCompatibilityMode={setProviderCompatibilityMode}
            onSyncSecrets={onSyncSecrets}
            onSaveConfig={onSaveConfig}
          />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// SEND VIEW
// ===========================================================================

function SendView({
  to,
  setTo,
  subject,
  setSubject,
  html,
  setHtml,
  idempotencyKey,
  setIdempotencyKey,
  bulkRecipients,
  setBulkRecipients,
  idempotencyPrefix,
  setIdempotencyPrefix,
  sendMode,
  setSendMode,
  onQueueSingle,
  onQueueBulk,
  onProcessQueue,
  processing,
  demoEmails,
  emailCounts,
  onCancel,
}: {
  to: string;
  setTo: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  html: string;
  setHtml: (v: string) => void;
  idempotencyKey: string;
  setIdempotencyKey: (v: string) => void;
  bulkRecipients: string;
  setBulkRecipients: (v: string) => void;
  idempotencyPrefix: string;
  setIdempotencyPrefix: (v: string) => void;
  sendMode: "single" | "bulk";
  setSendMode: (v: "single" | "bulk") => void;
  onQueueSingle: () => void;
  onQueueBulk: () => void;
  onProcessQueue: () => void;
  processing: boolean;
  demoEmails: any[] | undefined;
  emailCounts: Record<string, number>;
  onCancel: (emailId: string) => void;
}) {
  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ── Compose sidebar ── */}
      <div className="lg:w-[400px] xl:w-[440px] shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Mode toggle */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Compose
            </h2>
            <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <button
                onClick={() => setSendMode("single")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  sendMode === "single"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                Single
              </button>
              <button
                onClick={() => setSendMode("bulk")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors border-l border-zinc-200 dark:border-zinc-700 cursor-pointer",
                  sendMode === "bulk"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                Bulk
              </button>
            </div>
          </div>

          {sendMode === "single" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Recipient
                </Label>
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="user@example.com"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Idempotency Key
                  <span className="text-zinc-400 dark:text-zinc-500 ml-1">(optional)</span>
                </Label>
                <Input
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  placeholder="welcome:user-123"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Recipients
                  <span className="text-zinc-400 dark:text-zinc-500 ml-1">(comma or newline)</span>
                </Label>
                <Textarea
                  value={bulkRecipients}
                  onChange={(e) => setBulkRecipients(e.target.value)}
                  placeholder={"user1@example.com\nuser2@example.com"}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Idempotency Prefix
                  <span className="text-zinc-400 dark:text-zinc-500 ml-1">(optional)</span>
                </Label>
                <Input
                  value={idempotencyPrefix}
                  onChange={(e) => setIdempotencyPrefix(e.target.value)}
                  placeholder="campaign-2026-02"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                Subject
              </Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                HTML Body
              </Label>
              <Textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={sendMode === "single" ? onQueueSingle : onQueueBulk}
            >
              <Send className="size-3.5" />
              {sendMode === "single" ? "Queue Email" : "Queue Bulk"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onProcessQueue}
              disabled={processing}
            >
              <Zap className="size-3.5" />
              {processing ? "Processing\u2026" : "Process Queue"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Delivery feed ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Stats strip */}
        <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-5 py-2.5">
          <div className="flex items-center gap-5 overflow-x-auto text-xs">
            <CountChip label="Total" value={emailCounts.total} />
            <CountChip label="Queued" value={emailCounts.queued} color="bg-violet-500" />
            <CountChip label="Sending" value={emailCounts.sending} color="bg-sky-500" />
            <CountChip label="Sent" value={emailCounts.sent} color="bg-emerald-500" />
            <CountChip label="Failed" value={emailCounts.failed} color="bg-red-500" />
            <CountChip label="Retrying" value={emailCounts.retrying} color="bg-amber-500" />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {["Status", "Recipient", "Email ID", "Provider ID", "Mode", ""].map(
                  (h, i) => (
                    <th
                      key={h || i}
                      className={cn(
                        "text-left py-2.5 px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400",
                        i === 2 && "hidden md:table-cell",
                        i === 3 && "hidden lg:table-cell",
                        i === 4 && "hidden sm:table-cell",
                        i === 5 && "text-right",
                      )}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="text-sm">
              {(!demoEmails || demoEmails.length === 0) ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-16 text-zinc-400 dark:text-zinc-500 text-sm"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Mail className="size-8 text-zinc-300 dark:text-zinc-600" />
                      <p>No emails queued yet</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        Compose an email and hit Queue to get started
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                demoEmails.map((entry, i) => {
                  const status = entry.status?.status ?? "queued";
                  const canCancel = status === "queued" || status === "retrying";
                  return (
                    <tr
                      key={entry._id}
                      className={cn(
                        "border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors",
                        i === 0 && "animate-fade-in",
                      )}
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <StatusIndicator status={status} />
                          <Badge variant={statusBadgeVariant(status)} className="text-[11px]">
                            {status}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-sm text-zinc-700 dark:text-zinc-300 max-w-[200px] truncate">
                        {entry.recipient}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-zinc-500 dark:text-zinc-400 hidden md:table-cell max-w-[160px] truncate">
                        {truncate(entry.emailId, 20)}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-zinc-400 dark:text-zinc-500 hidden lg:table-cell max-w-[160px] truncate">
                        {entry.status?.providerMessageId
                          ? truncate(entry.status.providerMessageId, 20)
                          : "\u2014"}
                      </td>
                      <td className="py-2.5 px-4 hidden sm:table-cell">
                        <Badge variant="secondary" className="text-[11px]">
                          {entry.mode}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {canCancel && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCancel(entry.emailId)}
                            className="h-7 text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <X className="size-3" />
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CountChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {color && <span className={cn("size-2 rounded-full", color)} />}
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

// ===========================================================================
// INBOX VIEW
// ===========================================================================

function InboxView({
  inboxes,
  selectedInboxId,
  setSelectedInboxId,
  setTo,
  messages,
  selectedMessage,
  selectedMessageId,
  inboxLabel,
  setInboxLabel,
  onCreateInbox,
  onSyncInbox,
  onDeleteInbox,
  onOpenMessage,
}: {
  inboxes: any[] | undefined;
  selectedInboxId: Id<"mailtmInboxes"> | null;
  setSelectedInboxId: (v: Id<"mailtmInboxes">) => void;
  setTo: (v: string) => void;
  messages: any[] | undefined;
  selectedMessage: any | null;
  selectedMessageId: string | null;
  inboxLabel: string;
  setInboxLabel: (v: string) => void;
  onCreateInbox: () => void;
  onSyncInbox: (id: Id<"mailtmInboxes">) => void;
  onDeleteInbox: (id: Id<"mailtmInboxes">) => void;
  onOpenMessage: (id: string) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* ── Inbox sidebar ── */}
      <div className="md:w-[280px] shrink-0 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto">
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Mail.tm Inboxes
          </h2>

          <div className="flex gap-2">
            <Input
              value={inboxLabel}
              onChange={(e) => setInboxLabel(e.target.value)}
              placeholder="Inbox label"
              className="text-xs"
            />
            <Button size="sm" onClick={onCreateInbox}>
              <Plus className="size-3.5" />
              New
            </Button>
          </div>

          <div className="space-y-1.5">
            {(inboxes ?? []).map((inbox) => (
              <div
                key={inbox._id}
                className={cn(
                  "rounded-lg border p-3 transition-colors cursor-pointer group",
                  selectedInboxId === inbox._id
                    ? "border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900",
                )}
              >
                <button
                  onClick={() => {
                    setSelectedInboxId(inbox._id);
                    setTo(inbox.address);
                  }}
                  className="w-full text-left cursor-pointer"
                >
                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {inbox.label ?? "Inbox"}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 break-all mt-0.5 font-mono">
                    {inbox.address}
                  </p>
                </button>
                <div className="mt-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => onSyncInbox(inbox._id)}
                  >
                    <RefreshCw className="size-3" />
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-red-500 hover:text-red-600 dark:text-red-400"
                    onClick={() => onDeleteInbox(inbox._id)}
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}

            {(!inboxes || inboxes.length === 0) && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Inbox className="size-6 text-zinc-300 dark:text-zinc-600" />
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  No inboxes yet. Create one to start testing.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Message list + preview ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-w-0 overflow-hidden">
        {/* Message list */}
        <div className="lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-950">
          {selectedInboxId && (
            <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {messages?.length ?? 0} messages
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => onSyncInbox(selectedInboxId)}
              >
                <RefreshCw className="size-3" />
                Refresh
              </Button>
            </div>
          )}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {(messages ?? []).map((msg) => (
              <button
                key={msg._id}
                onClick={() => onOpenMessage(msg.messageId)}
                className={cn(
                  "w-full p-3 text-left transition-colors cursor-pointer",
                  selectedMessageId === msg.messageId
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                )}
              >
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {msg.fromAddress ?? "unknown"}
                </p>
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate mt-0.5">
                  {msg.subject ?? "(no subject)"}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                  {msg.intro ?? ""}
                </p>
              </button>
            ))}
            {messages?.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Mail className="size-6 text-zinc-300 dark:text-zinc-600" />
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  No messages. Send an email and sync.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900/50">
          {selectedMessage ? (
            <div className="p-6 space-y-4 animate-fade-in">
              <div className="space-y-1">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  From: {selectedMessage.fromAddress ?? "unknown"}
                </p>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedMessage.subject ?? "(no subject)"}
                </h2>
              </div>
              <Card>
                <CardContent className="p-4">
                  <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap overflow-auto max-h-[500px] leading-relaxed font-sans">
                    {selectedMessage.text ??
                      selectedMessage.html ??
                      selectedMessage.intro ??
                      "No content available."}
                  </pre>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <ChevronRight className="size-6 text-zinc-300 dark:text-zinc-600 mx-auto" />
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  Select a message to view
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// OPS VIEW
// ===========================================================================

function OpsView({
  onProcessQueue,
  onDryRunCleanup,
  processing,
  queueResult,
  emailCounts,
  config,
}: {
  onProcessQueue: () => void;
  onDryRunCleanup: () => void;
  processing: boolean;
  queueResult: QueueResult | null;
  emailCounts: Record<string, number>;
  config: any;
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
              Preview cleanup impact before deleting anything.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={onDryRunCleanup}>
              Run Cleanup Dry-Run
            </Button>

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

// ===========================================================================
// SETUP VIEW
// ===========================================================================

function SetupView({
  config,
  inboxes,
  defaultFrom,
  setDefaultFrom,
  defaultReplyTo,
  setDefaultReplyTo,
  sandboxTo,
  setSandboxTo,
  testMode,
  setTestMode,
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
  setTestMode: (v: boolean) => void;
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
                onChange={(e) => setTestMode(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="text-zinc-700 dark:text-zinc-300">Test Mode</span>
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
