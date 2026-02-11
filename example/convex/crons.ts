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

// Clean up old terminal emails and recover abandoned sends once a day.
crons.daily(
  "cleanup old emails",
  { hourUTC: 3, minuteUTC: 0 },
  api.autosendDemo.cleanupOldEmails,
  {},
);

export default crons;
