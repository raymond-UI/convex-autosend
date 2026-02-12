"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ChevronRight,
  Inbox,
  Mail,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

import { HtmlPreview } from "./shared";

// ---------------------------------------------------------------------------
// Mail.tm Mercure SSE — real-time push for new messages
// ---------------------------------------------------------------------------

const MERCURE_HUB = "https://mercure.mail.tm/.well-known/mercure";

export function useMailTmLiveSync(
  inboxes: Array<{ _id: Id<"mailtmInboxes">; accountId: string; token: string }> | undefined,
  onNewMessage: (inboxId: Id<"mailtmInboxes">) => void,
  enabled: boolean,
) {
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;

  // Stable key: only reconnect when inbox set or tokens change
  const connectionKey = useMemo(
    () => (inboxes ?? []).map((i) => `${i._id}:${i.token}`).join("|"),
    [inboxes],
  );

  useEffect(() => {
    if (!enabled || !inboxes || inboxes.length === 0) return;

    const controllers: AbortController[] = [];

    for (const inbox of inboxes) {
      if (!inbox.accountId || !inbox.token) continue;

      const ctrl = new AbortController();
      controllers.push(ctrl);

      const topic = `/accounts/${inbox.accountId}`;
      const url = `${MERCURE_HUB}?topic=${encodeURIComponent(topic)}`;

      (async () => {
        try {
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${inbox.token}`,
              Accept: "text/event-stream",
            },
            signal: ctrl.signal,
          });

          if (!res.ok || !res.body) return;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();

          while (!ctrl.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            // Any data frame means account activity (new message)
            if (chunk.includes("data:")) {
              onNewMessageRef.current(inbox._id);
            }
          }
        } catch {
          // SSE failed — cron polling handles it as fallback
        }
      })();
    }

    return () => controllers.forEach((c) => c.abort());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connectionKey]);
}

// ---------------------------------------------------------------------------
// InboxView
// ---------------------------------------------------------------------------

export function InboxView({
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
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate mt-0.5 flex items-center gap-1">
                  {msg.subject ?? "(no subject)"}
                  {msg.hasAttachments && <Paperclip className="size-3 shrink-0 text-zinc-400 dark:text-zinc-500" />}
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
                  {selectedMessage.html ? (
                    <HtmlPreview html={selectedMessage.html} />
                  ) : (
                    <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap overflow-auto max-h-[500px] leading-relaxed font-sans">
                      {selectedMessage.text ??
                        selectedMessage.intro ??
                        "No content available."}
                    </pre>
                  )}
                </CardContent>
              </Card>
              {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Paperclip className="size-3" />
                    {selectedMessage.attachments.length} attachment{selectedMessage.attachments.length > 1 ? "s" : ""}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedMessage.attachments.map((att: any) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                      >
                        <Paperclip className="size-3.5 shrink-0 text-zinc-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                            {att.filename}
                          </p>
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            {att.contentType ?? "unknown type"}
                            {att.size != null && ` · ${(att.size / 1024).toFixed(1)} KB`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
