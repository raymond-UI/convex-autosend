import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Process queued and retrying emails every 10 seconds.
crons.interval(
  "process email queue",
  { seconds: 10 },
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

export default crons;
