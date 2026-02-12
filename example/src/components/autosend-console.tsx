"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Send, Inbox, Settings2, Activity, Mail } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import type { AttachmentItem, QueueResult } from "./autosend-console/shared";
import { SendView } from "./autosend-console/send-view";
import { InboxView, useMailTmLiveSync } from "./autosend-console/inbox-view";
import { OpsView } from "./autosend-console/ops-view";
import { SetupView } from "./autosend-console/setup-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type View = "send" | "inbox" | "ops" | "setup";

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
  const executeCleanupOld = useAction(api.autosendDemo.executeCleanupOld);
  const executeCleanupAbandoned = useAction(api.autosendDemo.executeCleanupAbandoned);
  const createInbox = useAction(api.mailtm.createInbox);
  const syncInbox = useAction(api.mailtm.syncInbox);
  const syncAllInboxes = useAction(api.mailtm.syncAllInboxes);
  const fetchMessage = useAction(api.mailtm.fetchMessage);
  const deleteInbox = useMutation(api.mailtm.deleteInbox);

  // Form state — setup
  const [defaultFrom, setDefaultFrom] = useState("");
  const [defaultReplyTo, setDefaultReplyTo] = useState("");
  const [sandboxTo, setSandboxTo] = useState("");
  const [testMode, setTestMode] = useState(false);
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
  const [composeMode, setComposeMode] = useState<"content" | "template">("content");
  const [templateId, setTemplateId] = useState("");
  const [dynamicData, setDynamicData] = useState("");
  const [fromOverride, setFromOverride] = useState("");
  const [replyToOverride, setReplyToOverride] = useState("");
  const [toName, setToName] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyToName, setReplyToName] = useState("");
  const [ccField, setCcField] = useState("");
  const [bccField, setBccField] = useState("");
  const [unsubscribeGroupId, setUnsubscribeGroupId] = useState("");
  const [emailMetadata, setEmailMetadata] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  // Form state — inbox
  const [inboxLabel, setInboxLabel] = useState("QA Inbox");

  // Ops
  const [queueResult, setQueueResult] = useState<QueueResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cleanupOldResult, setCleanupOldResult] = useState<any>(null);
  const [cleanupAbandonedResult, setCleanupAbandonedResult] = useState<any>(null);

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

  // Auto-sync inboxes when switching to the inbox tab
  useEffect(() => {
    if (view !== "inbox") return;
    if (!inboxes || inboxes.length === 0) return;
    syncAllInboxes({}).catch(() => {
      // silent — cron will catch up
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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
  // Helpers
  // ---------------------------------------------------------------------------

  function parseCcBccList(input: string): Array<{ email: string; name?: string }> | undefined {
    const entries = input.split(",").map((s) => s.trim()).filter(Boolean);
    if (entries.length === 0) return undefined;
    return entries.map((entry) => {
      // Parse "Name <email>" format
      const match = entry.match(/^(.+?)\s*<([^>]+)>$/);
      if (match) return { email: match[2]!.trim(), name: match[1]!.trim() };
      return { email: entry };
    });
  }

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

  const onToggleTestMode = useCallback(
    async (enabled: boolean) => {
      setTestMode(enabled);
      try {
        await setConfig({ testMode: enabled });
        toast.success(enabled ? "Test mode ON \u2014 emails redirect to sandbox" : "Test mode OFF \u2014 emails go to real recipients");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save test mode");
      }
    },
    [setConfig],
  );

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
    let parsedDynamic: unknown;
    if (composeMode === "template" && dynamicData.trim()) {
      try { parsedDynamic = JSON.parse(dynamicData); } catch { toast.error("Invalid Dynamic Data JSON"); return; }
    }
    let parsedMetadata: unknown;
    if (emailMetadata.trim()) {
      try { parsedMetadata = JSON.parse(emailMetadata); } catch { toast.error("Invalid Metadata JSON"); return; }
    }
    try {
      const result = await sendEmail({
        to: to.trim(),
        toName: toName.trim() || undefined,
        subject: composeMode === "content" ? subject : undefined,
        html: composeMode === "content" ? html : undefined,
        templateId: composeMode === "template" && templateId.trim() ? templateId.trim() : undefined,
        dynamicData: parsedDynamic,
        from: fromOverride.trim() || undefined,
        fromName: fromName.trim() || undefined,
        replyTo: replyToOverride.trim() || undefined,
        replyToName: replyToName.trim() || undefined,
        cc: parseCcBccList(ccField),
        bcc: parseCcBccList(bccField),
        unsubscribeGroupId: unsubscribeGroupId.trim() || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        metadata: parsedMetadata,
        idempotencyKey: idempotencyKey.trim() || undefined,
      });
      toast.success(
        result.deduped ? `Deduped \u2014 ${result.emailId}` : `Queued \u2014 ${result.emailId}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Queue failed");
    }
  }, [sendEmail, to, toName, subject, html, idempotencyKey, composeMode, templateId, dynamicData, fromOverride, fromName, replyToOverride, replyToName, ccField, bccField, unsubscribeGroupId, emailMetadata, attachments]);

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
    let parsedDynamic: unknown;
    if (composeMode === "template" && dynamicData.trim()) {
      try { parsedDynamic = JSON.parse(dynamicData); } catch { toast.error("Invalid Dynamic Data JSON"); return; }
    }
    let parsedMetadata: unknown;
    if (emailMetadata.trim()) {
      try { parsedMetadata = JSON.parse(emailMetadata); } catch { toast.error("Invalid Metadata JSON"); return; }
    }
    try {
      const result = await sendBulk({
        recipients,
        subject: composeMode === "content" ? subject : undefined,
        html: composeMode === "content" ? html : undefined,
        templateId: composeMode === "template" && templateId.trim() ? templateId.trim() : undefined,
        dynamicData: parsedDynamic,
        from: fromOverride.trim() || undefined,
        fromName: fromName.trim() || undefined,
        replyTo: replyToOverride.trim() || undefined,
        replyToName: replyToName.trim() || undefined,
        cc: parseCcBccList(ccField),
        bcc: parseCcBccList(bccField),
        unsubscribeGroupId: unsubscribeGroupId.trim() || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        metadata: parsedMetadata,
        idempotencyKeyPrefix: idempotencyPrefix.trim() || undefined,
      });
      toast.success(`Queued ${result.acceptedCount} emails`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk queue failed");
    }
  }, [sendBulk, bulkRecipients, subject, html, idempotencyPrefix, composeMode, templateId, dynamicData, fromOverride, fromName, replyToOverride, replyToName, ccField, bccField, unsubscribeGroupId, emailMetadata, attachments]);

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

  const onExecuteCleanupOld = useCallback(async () => {
    if (!confirm("Delete old terminal emails older than 7 days? This cannot be undone.")) return;
    try {
      const result = await executeCleanupOld({ olderThanMs: 7 * 24 * 60 * 60 * 1000 });
      setCleanupOldResult(result);
      toast.success(`Deleted ${result.deletedCount} old emails`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    }
  }, [executeCleanupOld]);

  const onExecuteCleanupAbandoned = useCallback(async () => {
    if (!confirm("Recover abandoned sending emails (stuck >15 min)? They will be re-queued.")) return;
    try {
      const result = await executeCleanupAbandoned({ staleAfterMs: 15 * 60 * 1000 });
      setCleanupAbandonedResult(result);
      toast.success(`Recovered ${result.recoveredCount} abandoned emails`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recovery failed");
    }
  }, [executeCleanupAbandoned]);

  const onAddFiles = useCallback(async (files: FileList) => {
    const newItems: AttachmentItem[] = [];
    for (const file of Array.from(files)) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.readAsDataURL(file);
      });
      newItems.push({
        filename: file.name,
        content: base64,
        contentType: file.type || undefined,
      });
    }
    setAttachments((prev) => [...prev, ...newItems]);
  }, []);

  const onAddUrlAttachment = useCallback((filename: string, fileUrl: string, description?: string) => {
    if (!filename.trim() || !fileUrl.trim()) return;
    setAttachments((prev) => [...prev, {
      filename: filename.trim(),
      fileUrl: fileUrl.trim(),
      description: description?.trim() || undefined,
    }]);
  }, []);

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

  // Real-time SSE sync — triggers when Mail.tm receives a new message
  const onLiveMessage = useCallback(
    (inboxId: Id<"mailtmInboxes">) => {
      syncInbox({ inboxId }).catch(() => {});
    },
    [syncInbox],
  );
  useMailTmLiveSync(inboxes as any, onLiveMessage, view === "inbox");

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
              <Badge
                variant="warning"
                className="text-[10px] ml-1 cursor-pointer"
                onClick={() => setView("setup")}
              >
                Test Mode ON
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
            inboxes={inboxes}
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
            composeMode={composeMode}
            setComposeMode={setComposeMode}
            templateId={templateId}
            setTemplateId={setTemplateId}
            dynamicData={dynamicData}
            setDynamicData={setDynamicData}
            fromOverride={fromOverride}
            setFromOverride={setFromOverride}
            replyToOverride={replyToOverride}
            setReplyToOverride={setReplyToOverride}
            toName={toName}
            setToName={setToName}
            fromName={fromName}
            setFromName={setFromName}
            replyToName={replyToName}
            setReplyToName={setReplyToName}
            ccField={ccField}
            setCcField={setCcField}
            bccField={bccField}
            setBccField={setBccField}
            unsubscribeGroupId={unsubscribeGroupId}
            setUnsubscribeGroupId={setUnsubscribeGroupId}
            emailMetadata={emailMetadata}
            setEmailMetadata={setEmailMetadata}
            attachments={attachments}
            setAttachments={setAttachments}
            onAddFiles={onAddFiles}
            onAddUrlAttachment={onAddUrlAttachment}
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
            onExecuteCleanupOld={onExecuteCleanupOld}
            onExecuteCleanupAbandoned={onExecuteCleanupAbandoned}
            processing={processing}
            queueResult={queueResult}
            emailCounts={emailCounts}
            config={config}
            cleanupOldResult={cleanupOldResult}
            cleanupAbandonedResult={cleanupAbandonedResult}
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
            onToggleTestMode={onToggleTestMode}
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
