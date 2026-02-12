"use client";

import React, { useState, useCallback } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Inbox,
  Mail,
  Paperclip,
  Plus,
  Send,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import type { AttachmentItem } from "./shared";
import {
  CountChip,
  EmailDetailRow,
  StatusIndicator,
  statusBadgeVariant,
  truncate,
} from "./shared";

export function SendView({
  inboxes,
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
  composeMode,
  setComposeMode,
  templateId,
  setTemplateId,
  dynamicData,
  setDynamicData,
  fromOverride,
  setFromOverride,
  replyToOverride,
  setReplyToOverride,
  emailMetadata,
  setEmailMetadata,
  attachments,
  setAttachments,
  onAddFiles,
  onQueueSingle,
  onQueueBulk,
  onProcessQueue,
  processing,
  demoEmails,
  emailCounts,
  onCancel,
}: {
  inboxes: any[] | undefined;
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
  composeMode: "content" | "template";
  setComposeMode: (v: "content" | "template") => void;
  templateId: string;
  setTemplateId: (v: string) => void;
  dynamicData: string;
  setDynamicData: (v: string) => void;
  fromOverride: string;
  setFromOverride: (v: string) => void;
  replyToOverride: string;
  setReplyToOverride: (v: string) => void;
  emailMetadata: string;
  setEmailMetadata: (v: string) => void;
  attachments: AttachmentItem[];
  setAttachments: (v: AttachmentItem[]) => void;
  onAddFiles: (files: FileList) => void;
  onQueueSingle: () => void;
  onQueueBulk: () => void;
  onProcessQueue: () => void;
  processing: boolean;
  demoEmails: any[] | undefined;
  emailCounts: Record<string, number>;
  onCancel: (emailId: string) => void;
}) {
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleError = useCallback((emailId: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }, []);

  const copyError = useCallback((emailId: string, error: string) => {
    navigator.clipboard.writeText(error);
    setCopiedId(emailId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const toggleDetail = useCallback((emailId: string) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }, []);

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

          {/* Content / Template toggle */}
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden self-start">
            <button
              onClick={() => setComposeMode("content")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                composeMode === "content"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              Content
            </button>
            <button
              onClick={() => setComposeMode("template")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors border-l border-zinc-200 dark:border-zinc-700 cursor-pointer",
                composeMode === "template"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              Template
            </button>
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                    Recipients
                    <span className="text-zinc-400 dark:text-zinc-500 ml-1">(comma or newline)</span>
                  </Label>
                  {inboxes && inboxes.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300"
                      onClick={() => {
                        const addresses = inboxes.map((i: any) => i.address).join("\n");
                        setBulkRecipients(addresses);
                        toast.success(`Added ${inboxes.length} Mail.tm address${inboxes.length > 1 ? "es" : ""}`);
                      }}
                    >
                      <Inbox className="size-3" />
                      Use Mail.tm inboxes
                    </Button>
                  )}
                </div>
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

          {composeMode === "content" ? (
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
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Template ID
                </Label>
                <Input
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  placeholder="welcome-email-v2"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Subject
                  <span className="text-zinc-400 dark:text-zinc-500 ml-1">(optional override)</span>
                </Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Dynamic Data (JSON)
                </Label>
                <Textarea
                  value={dynamicData}
                  onChange={(e) => setDynamicData(e.target.value)}
                  placeholder={'{\n  "name": "Jane",\n  "plan": "Pro"\n}'}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Attachments */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Paperclip className="size-3" />
              Attachments
              <span className="text-zinc-400 dark:text-zinc-500">(base64, ~1MB limit)</span>
            </Label>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs">
                    <span className="truncate text-zinc-700 dark:text-zinc-300">{att.filename}</span>
                    <button
                      onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                      className="text-zinc-400 hover:text-red-500 cursor-pointer ml-2"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer">
              <Plus className="size-3" />
              Add files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && onAddFiles(e.target.files)}
              />
            </label>
          </div>

          {/* Advanced options */}
          <details className="group">
            <summary className="text-xs font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 list-none flex items-center gap-1">
              <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
              Advanced Options
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">From Override</Label>
                <Input
                  value={fromOverride}
                  onChange={(e) => setFromOverride(e.target.value)}
                  placeholder="custom-sender@example.com"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">Reply-To Override</Label>
                <Input
                  value={replyToOverride}
                  onChange={(e) => setReplyToOverride(e.target.value)}
                  placeholder="replies@example.com"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500 dark:text-zinc-400">Metadata (JSON)</Label>
                <Textarea
                  value={emailMetadata}
                  onChange={(e) => setEmailMetadata(e.target.value)}
                  placeholder={'{"campaign": "welcome-2026"}'}
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </details>

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
                  const lastError = entry.status?.lastError;
                  const attemptCount = entry.status?.attemptCount ?? 0;
                  const maxAttempts = entry.status?.maxAttempts ?? 0;
                  const canCancel = status === "queued" || status === "retrying";
                  const hasError = lastError && (status === "failed" || status === "retrying");
                  return (
                    <React.Fragment key={entry._id}>
                      <tr
                        onClick={() => toggleDetail(entry.emailId)}
                        className={cn(
                          "hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer",
                          !hasError && !expandedDetails.has(entry.emailId) && "border-b border-zinc-100 dark:border-zinc-800/50",
                          i === 0 && "animate-fade-in",
                        )}
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <StatusIndicator status={status} />
                            <Badge variant={statusBadgeVariant(status)} className="text-[11px]">
                              {status}
                            </Badge>
                            {attemptCount > 0 && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                                {attemptCount}/{maxAttempts}
                              </span>
                            )}
                            {hasError && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleError(entry.emailId); }}
                                className="inline-flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 cursor-pointer"
                              >
                                <AlertCircle className="size-3" />
                                <ChevronDown
                                  className={cn(
                                    "size-3 transition-transform",
                                    expandedErrors.has(entry.emailId) && "rotate-180",
                                  )}
                                />
                              </button>
                            )}
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
                              onClick={(e) => { e.stopPropagation(); onCancel(entry.emailId); }}
                              className="h-7 text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                            >
                              <X className="size-3" />
                              Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                      {hasError && expandedErrors.has(entry.emailId) && (
                        <tr className="animate-fade-in">
                          <td colSpan={6} className="px-4 pb-2.5 pt-0">
                            <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2">
                              <AlertCircle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                              <p className="flex-1 text-xs text-red-700 dark:text-red-400 font-mono break-all leading-relaxed">
                                {lastError}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
                                onClick={(e) => { e.stopPropagation(); copyError(entry.emailId, lastError); }}
                              >
                                {copiedId === entry.emailId ? (
                                  <Check className="size-3" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {expandedDetails.has(entry.emailId) && (
                        <tr className="border-b border-zinc-100 dark:border-zinc-800/50 animate-fade-in">
                          <td colSpan={6} className="bg-zinc-50/50 dark:bg-zinc-900/30">
                            <EmailDetailRow emailId={entry.emailId} entry={entry} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
