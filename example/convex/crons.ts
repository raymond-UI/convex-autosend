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

// Clean up old terminal emails and recover abandoned sends once a day.
crons.daily(
  "cleanup old emails",
  { hourUTC: 3, minuteUTC: 0 },
  api.autosendDemo.cleanupOldEmails,
  {},
);

export default crons;
