import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Safety-net cron: emails are processed immediately on enqueue via scheduler,
// so this only catches edge cases (e.g. retries whose delay has elapsed).
crons.interval(
  "process email queue",
  { minutes: 5 },
  api.autosendDemo.processQueue,
  {},
);

// Sync all Mail.tm inboxes every 30 seconds so delivered emails show up.
crons.interval(
  "sync mailtm inboxes",
  { seconds: 30 },
  api.mailtm.syncAllInboxes,
  {},
);

// Recover emails stuck in "sending" state (abandoned) every 15 minutes.
// Emails that have been in "sending" for longer than the stale threshold
// (default 15 min) are either retried or marked as failed.
crons.interval(
  "recover abandoned emails",
  { minutes: 15 },
  api.autosendDemo.cleanupAbandonedEmails,
  {},
);

// Clean up old terminal emails once a day.
crons.daily(
  "cleanup old emails",
  { hourUTC: 3, minuteUTC: 0 },
  api.autosendDemo.cleanupOldEmails,
  {},
);

// Clean up old webhook delivery records (used for dedup) once a day.
crons.daily(
  "cleanup old webhook deliveries",
  { hourUTC: 3, minuteUTC: 30 },
  api.autosendDemo.cleanupOldDeliveries,
  {},
);

// Clean up demo-specific data (demoEmails, mailtm inboxes/messages) older than 24h.
crons.daily(
  "cleanup demo data",
  { hourUTC: 4, minuteUTC: 0 },
  api.autosendDemo.cleanupDemoData,
  {},
);

crons.daily(
  "cleanup old mailtm inboxes",
  { hourUTC: 4, minuteUTC: 15 },
  api.mailtm.cleanupOldInboxes,
  {},
);

export default crons;
