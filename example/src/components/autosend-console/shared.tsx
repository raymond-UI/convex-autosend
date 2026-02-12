"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Clock } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueResult = {
  processedCount: number;
  sentCount: number;
  retriedCount: number;
  failedCount: number;
  hasMoreDue: boolean;
};

export type AttachmentItem = {
  filename: string;
  content: string;
  contentType: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function statusBadgeVariant(status?: string) {
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

export function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

export function StatusIndicator({ status }: { status?: string }) {
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

export function CountChip({
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

export function HtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          setHeight(Math.min(body.scrollHeight + 16, 800));
        }
      } catch {
        // cross-origin; keep default height
      }
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  const srcdoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
body{margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#27272a;word-break:break-word}
img{max-width:100%;height:auto}
a{color:#2563eb}
</style></head><body>${html}</body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-same-origin"
      title="Email preview"
      className="w-full border-0 rounded"
      style={{ height }}
    />
  );
}

// ---------------------------------------------------------------------------
// Email detail expansion
// ---------------------------------------------------------------------------

export function EmailDetailRow({ emailId, entry }: { emailId: string; entry: any }) {
  const events = useQuery(api.autosendDemo.listEmailEvents, { emailId, limit: 20 });
  const status = entry.status;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      {/* Email details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 text-xs">
        <DetailItem label="Email ID" value={emailId} mono />
        <DetailItem label="Status" value={status?.status ?? "queued"} />
        <DetailItem label="From" value={status?.from ?? "\u2014"} mono />
        <DetailItem
          label="To"
          value={
            Array.isArray(status?.to)
              ? status.to.join(", ")
              : (status?.to ?? entry.recipient)
          }
          mono
        />
        {status?.replyTo && <DetailItem label="Reply-To" value={status.replyTo} mono />}
        {status?.subject && <DetailItem label="Subject" value={status.subject} />}
        {status?.templateId && <DetailItem label="Template ID" value={status.templateId} mono />}
        <DetailItem label="Provider ID" value={status?.providerMessageId ?? "\u2014"} mono />
        <DetailItem
          label="Attempts"
          value={`${status?.attemptCount ?? 0} / ${status?.maxAttempts ?? 0}`}
        />
        <DetailItem
          label="Created"
          value={status?.createdAt ? new Date(status.createdAt).toLocaleString() : "\u2014"}
        />
        {status?.sentAt && (
          <DetailItem label="Sent" value={new Date(status.sentAt).toLocaleString()} />
        )}
        {status?.idempotencyKey && (
          <DetailItem label="Idempotency Key" value={status.idempotencyKey} mono />
        )}
      </div>

      {/* Metadata */}
      {status?.metadata && (
        <div className="text-xs">
          <p className="text-zinc-500 dark:text-zinc-400 mb-1">Metadata</p>
          <pre className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 overflow-auto max-h-24">
            {JSON.stringify(status.metadata, null, 2)}
          </pre>
        </div>
      )}

      {/* Event timeline */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Clock className="size-3" />
          Webhook Events
        </p>
        {!events || events.length === 0 ? (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">
            No webhook events yet. Configure webhooks at your provider to see delivery events here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {events.map((evt, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <EventDot type={evt.eventType} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {evt.eventType}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-500 ml-2">
                    {new Date(evt.occurredAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className={cn(
          "text-zinc-900 dark:text-zinc-100 mt-0.5 break-all",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EventDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    "email.sent": "bg-emerald-500",
    "email.delivered": "bg-emerald-500",
    "email.deferred": "bg-amber-500",
    "email.bounced": "bg-red-500",
    "email.spam_reported": "bg-red-500",
    "email.opened": "bg-sky-500",
    "email.clicked": "bg-sky-500",
  };
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full mt-1 shrink-0",
        colors[type] ?? "bg-zinc-400",
      )}
    />
  );
}
