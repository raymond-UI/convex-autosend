"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { cn } from "@/lib/utils";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border glass-card p-5 md:p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-sm text-[color:var(--muted-foreground)] mt-1">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function statusTone(status?: string) {
  switch (status) {
    case "sent":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35";
    case "failed":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35";
    case "retrying":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35";
    case "sending":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/35";
    case "canceled":
      return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/35";
    default:
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/35";
  }
}

export default function AutoSendConsole() {
  const config = useQuery(api.autosendDemo.getConfig, {});
  const demoEmails = useQuery(api.autosendDemo.listDemoEmails, { limit: 40 });
  const inboxes = useQuery(api.mailtm.listInboxes, {});

  const [selectedInboxId, setSelectedInboxId] = useState<Id<"mailtmInboxes"> | null>(null);
  const messages = useQuery(
    api.mailtm.listMessages,
    selectedInboxId ? { inboxId: selectedInboxId, limit: 80 } : "skip",
  );

  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Welcome to AutoSend");
  const [htmlBody, setHtmlBody] = useState(
    "<h2>Welcome</h2><p>Your account is now ready.</p>",
  );
  const [bulkRecipients, setBulkRecipients] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [idempotencyPrefix, setIdempotencyPrefix] = useState("");

  const [label, setLabel] = useState("Demo Inbox");

  const [autosendApiKey, setAutosendApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [defaultFrom, setDefaultFrom] = useState("");
  const [defaultReplyTo, setDefaultReplyTo] = useState("");
  const [sandboxTo, setSandboxTo] = useState("");
  const [testMode, setTestMode] = useState(true);
  const [providerCompatibilityMode, setProviderCompatibilityMode] = useState<
    "strict" | "lenient"
  >("strict");

  const [queueResult, setQueueResult] = useState<{
    processedCount: number;
    sentCount: number;
    retriedCount: number;
    failedCount: number;
    hasMoreDue: boolean;
  } | null>(null);

  const sendEmail = useMutation(api.autosendDemo.sendEmail);
  const sendBulk = useMutation(api.autosendDemo.sendBulk);
  const cancelEmail = useMutation(api.autosendDemo.cancelEmail);
  const setConfig = useMutation(api.autosendDemo.setConfig);

  const processQueue = useAction(api.autosendDemo.processQueue);
  const cleanupOld = useAction(api.autosendDemo.cleanupOldEmails);
  const cleanupAbandoned = useAction(api.autosendDemo.cleanupAbandonedEmails);

  const createInbox = useAction(api.mailtm.createInbox);
  const syncInbox = useAction(api.mailtm.syncInbox);
  const fetchMessage = useAction(api.mailtm.fetchMessage);
  const deleteInbox = useMutation(api.mailtm.deleteInbox);

  const [configInitialized, setConfigInitialized] = useState(false);
  useEffect(() => {
    if (!config || configInitialized) return;

    setDefaultFrom(config.defaultFrom ?? "");
    setDefaultReplyTo(config.defaultReplyTo ?? "");
    setSandboxTo(config.sandboxTo.join(", "));
    setTestMode(config.testMode);
    setProviderCompatibilityMode(config.providerCompatibilityMode);
    setConfigInitialized(true);
  }, [config, configInitialized]);

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

    const stillExists = inboxes.some((inbox) => inbox._id === selectedInboxId);
    if (!stillExists) {
      setSelectedInboxId(inboxes[0]!._id);
      setTo(inboxes[0]!.address);
    }
  }, [inboxes, selectedInboxId, to]);

  const activeInbox = useMemo(
    () => inboxes?.find((inbox) => inbox._id === selectedInboxId) ?? null,
    [inboxes, selectedInboxId],
  );

  const activeMessage = useMemo(
    () => messages?.find((message) => message.messageId === activeMessageId) ?? null,
    [messages, activeMessageId],
  );

  async function handleCreateInbox() {
    try {
      const result = await createInbox({ label: label.trim() || undefined });
      toast.success(`Created inbox ${result.address}`);
      setSelectedInboxId(result.inboxId as Id<"mailtmInboxes">);
      setTo(result.address);
      setBulkRecipients((current) =>
        current.trim().length > 0 ? `${current}\n${result.address}` : result.address,
      );
      await syncInbox({ inboxId: result.inboxId as Id<"mailtmInboxes"> });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create inbox");
    }
  }

  async function handleSyncInbox(inboxId: Id<"mailtmInboxes">) {
    try {
      const result = await syncInbox({ inboxId });
      toast.success(`Synced ${result.syncedCount} messages`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync inbox");
    }
  }

  async function handleOpenMessage(messageId: string) {
    if (!selectedInboxId) return;
    try {
      await fetchMessage({ inboxId: selectedInboxId, messageId });
      setActiveMessageId(messageId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch message");
    }
  }

  async function handleDeleteInbox(inboxId: Id<"mailtmInboxes">) {
    try {
      await deleteInbox({ inboxId });
      toast.success("Inbox removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete inbox");
    }
  }

  async function handleSendSingle() {
    if (!to.trim()) {
      toast.error("Recipient is required");
      return;
    }

    try {
      const result = await sendEmail({
        to: to.trim(),
        subject,
        html: htmlBody,
        idempotencyKey: idempotencyKey.trim() || undefined,
      });
      toast.success(
        result.deduped
          ? `Deduped send -> ${result.emailId}`
          : `Queued email -> ${result.emailId}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue email");
    }
  }

  async function handleSendBulk() {
    const recipients = Array.from(
      new Set(
        bulkRecipients
          .split(/[\n,]/g)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );

    if (recipients.length === 0) {
      toast.error("Add at least one recipient for bulk send");
      return;
    }

    try {
      const result = await sendBulk({
        recipients,
        subject,
        html: htmlBody,
        idempotencyKeyPrefix: idempotencyPrefix.trim() || undefined,
      });
      toast.success(`Queued ${result.acceptedCount} emails`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed bulk queue");
    }
  }

  async function handleProcessQueue() {
    try {
      const result = await processQueue({});
      setQueueResult(result);
      toast.success(
        `Processed ${result.processedCount} | Sent ${result.sentCount} | Retried ${result.retriedCount}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Queue processing failed");
    }
  }

  async function handleSaveConfig() {
    try {
      await setConfig({
        autosendApiKey: autosendApiKey.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
        defaultFrom: defaultFrom.trim() || undefined,
        defaultReplyTo: defaultReplyTo.trim() || undefined,
        sandboxTo: sandboxTo
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        testMode,
        providerCompatibilityMode,
      });

      setAutosendApiKey("");
      setWebhookSecret("");
      toast.success("Autosend config updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Config update failed");
    }
  }

  async function handleCleanup() {
    try {
      const [oldResult, abandonedResult] = await Promise.all([
        cleanupOld({ dryRun: true, olderThanMs: 7 * 24 * 60 * 60 * 1000 }),
        cleanupAbandoned({ dryRun: true, staleAfterMs: 15 * 60 * 1000 }),
      ]);
      toast.success(
        `Dry-run cleanup: old=${oldResult.emailIds.length}, abandoned=${abandonedResult.emailIds.length}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cleanup check failed");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <div className="space-y-6">
        <Section
          title="AutoSend Configuration"
          subtitle="Secrets are write-only. Safe config state comes from getConfig()."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm">AutoSend API Key (optional update)</span>
              <input
                type="password"
                value={autosendApiKey}
                onChange={(event) => setAutosendApiKey(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="as_live_..."
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Webhook Secret (optional update)</span>
              <input
                type="password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="whsec_..."
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Default From</span>
              <input
                value={defaultFrom}
                onChange={(event) => setDefaultFrom(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="noreply@example.com"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Default Reply-To</span>
              <input
                value={defaultReplyTo}
                onChange={(event) => setDefaultReplyTo(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="help@example.com"
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <span className="text-sm">Sandbox recipients (comma separated)</span>
            <input
              value={sandboxTo}
              onChange={(event) => setSandboxTo(event.target.value)}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              placeholder="qa1@demo.dev, qa2@demo.dev"
            />
          </label>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(event) => setTestMode(event.target.checked)}
              />
              testMode enabled
            </label>

            <label className="inline-flex items-center gap-2">
              <span>Compatibility mode</span>
              <select
                value={providerCompatibilityMode}
                onChange={(event) =>
                  setProviderCompatibilityMode(event.target.value as "strict" | "lenient")
                }
                className="rounded-md border bg-transparent px-2 py-1"
              >
                <option value="strict">strict</option>
                <option value="lenient">lenient</option>
              </select>
            </label>

            <button
              onClick={handleSaveConfig}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              Save Config
            </button>
          </div>

          <div className="rounded-lg border p-3 text-sm text-[color:var(--muted-foreground)]">
            <p>hasApiKey: {String(config?.hasApiKey ?? false)}</p>
            <p>hasWebhookSecret: {String(config?.hasWebhookSecret ?? false)}</p>
            <p>rateLimitRps: {config?.rateLimitRps ?? "-"}</p>
            <p>maxAttempts: {config?.maxAttempts ?? "-"}</p>
          </div>
        </Section>

        <Section
          title="Queue Email Jobs"
          subtitle="Use generated Mail.tm inboxes as recipients, then run processQueue to dispatch."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">To</span>
              <input
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="recipient@domain.tld"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">HTML Body</span>
              <textarea
                value={htmlBody}
                onChange={(event) => setHtmlBody(event.target.value)}
                className="h-36 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Idempotency Key (single)</span>
              <input
                value={idempotencyKey}
                onChange={(event) => setIdempotencyKey(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="welcome:user-123"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Idempotency Prefix (bulk)</span>
              <input
                value={idempotencyPrefix}
                onChange={(event) => setIdempotencyPrefix(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="campaign-2026-02"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Bulk Recipients (comma or newline separated)</span>
              <textarea
                value={bulkRecipients}
                onChange={(event) => setBulkRecipients(event.target.value)}
                className="h-28 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                placeholder="one@mail.tm\ntwo@mail.tm"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSendSingle}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              Queue Single Email
            </button>
            <button
              onClick={handleSendBulk}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              Queue Bulk Emails
            </button>
            <button
              onClick={handleProcessQueue}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              Process Queue
            </button>
            <button
              onClick={handleCleanup}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              Dry-run Cleanup
            </button>
          </div>

          {queueResult ? (
            <div className="rounded-lg border p-3 text-sm grid grid-cols-2 md:grid-cols-5 gap-2">
              <p>processed: {queueResult.processedCount}</p>
              <p>sent: {queueResult.sentCount}</p>
              <p>retried: {queueResult.retriedCount}</p>
              <p>failed: {queueResult.failedCount}</p>
              <p>hasMoreDue: {String(queueResult.hasMoreDue)}</p>
            </div>
          ) : null}
        </Section>

        <Section
          title="Delivery Lifecycle"
          subtitle="Statuses are loaded from autosend component queries over tracked demo email IDs."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[color:var(--muted-foreground)] border-b">
                  <th className="py-2 pr-3">Email ID</th>
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(demoEmails ?? []).map((entry) => {
                  const status = entry.status?.status ?? "queued";
                  return (
                    <tr key={entry._id} className="border-b/60">
                      <td className="py-2 pr-3 font-mono text-xs">{entry.emailId}</td>
                      <td className="py-2 pr-3">{entry.recipient}</td>
                      <td className="py-2 pr-3 uppercase text-xs tracking-wide">{entry.mode}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-xs",
                            statusTone(status),
                          )}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-[color:var(--muted-foreground)]">
                        {entry.status?.providerMessageId ?? "-"}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={async () => {
                            try {
                              const result = await cancelEmail({ emailId: entry.emailId });
                              toast.success(result.canceled ? "Email canceled" : "Cannot cancel in current status");
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Cancel failed");
                            }
                          }}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div className="space-y-6">
        <Section
          title="Mail.tm Inbox Lab"
          subtitle="Create disposable addresses, sync inboxes, and inspect received content in-app."
        >
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Mail.tm is rate-limited (~8 QPS/IP). This demo keeps calls server-side through Convex actions.
          </p>

          <div className="flex gap-2">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm"
              placeholder="Inbox label"
            />
            <button
              onClick={handleCreateInbox}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              Create Inbox
            </button>
          </div>

          <div className="space-y-2">
            {(inboxes ?? []).map((inbox) => (
              <div
                key={inbox._id}
                className={cn(
                  "rounded-lg border p-3",
                  selectedInboxId === inbox._id && "ring-1 ring-[color:var(--ring)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setSelectedInboxId(inbox._id);
                      setTo(inbox.address);
                    }}
                    className="text-left"
                  >
                    <p className="font-medium">{inbox.label ?? "mail.tm inbox"}</p>
                    <p className="font-mono text-xs text-[color:var(--muted-foreground)]">
                      {inbox.address}
                    </p>
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSyncInbox(inbox._id)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      Sync
                    </button>
                    <button
                      onClick={() => handleDeleteInbox(inbox._id)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {activeInbox ? (
            <div className="space-y-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-[color:var(--muted-foreground)]">Selected inbox</p>
                <p className="font-mono text-sm break-all">{activeInbox.address}</p>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-72 overflow-auto divide-y">
                  {(messages ?? []).map((message) => (
                    <button
                      key={message._id}
                      onClick={() => handleOpenMessage(message.messageId)}
                      className={cn(
                        "w-full p-3 text-left hover:bg-black/5 dark:hover:bg-white/10",
                        activeMessageId === message.messageId && "bg-black/5 dark:bg-white/10",
                      )}
                    >
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        {message.fromAddress ?? "unknown sender"}
                      </p>
                      <p className="font-medium text-sm truncate">{message.subject ?? "(no subject)"}</p>
                      <p className="text-xs text-[color:var(--muted-foreground)] truncate">
                        {message.intro ?? "(no preview)"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-semibold">Message Viewer</p>
                {activeMessage ? (
                  <>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      from: {activeMessage.fromAddress ?? "unknown"}
                    </p>
                    <p className="font-medium">{activeMessage.subject ?? "(no subject)"}</p>
                    <pre className="rounded-md border p-3 text-xs whitespace-pre-wrap overflow-auto max-h-72 bg-black/[0.03] dark:bg-white/[0.03]">
                      {activeMessage.text ?? activeMessage.html ?? activeMessage.intro ?? "No content loaded"}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    Select a message to load full content from Mail.tm.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--muted-foreground)]">Create an inbox to begin.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
