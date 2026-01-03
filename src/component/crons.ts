/**
 * Convex Built-in Crons
 *
 * Periodic triggers for component background tasks.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

// Run cron processor every minute to check for due jobs
crons.interval(
  "process-due-cron-jobs",
  { minutes: 1 },
  internal.cronExecutor.processDueCronJobs,
);

export default crons;
