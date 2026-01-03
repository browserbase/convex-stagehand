/**
 * Public API for the Browserbase component
 *
 * This file exports the functions that can be called from your Convex app
 * after installing this component.
 */

// Core job management APIs
export { scheduleJob, getJobStatus, listJobs, cancelJob } from "./jobs.js";

// Internal APIs for user actions to call
// These are exported but prefixed with underscores to indicate they're internal
export { completeJob as _completeJob, failJob as _failJob } from "./jobs.js";

// Cron job management APIs
export {
  createCronJob,
  updateCronJob,
  deleteCronJob,
  getCronJob,
  listCronJobs,
} from "./cronJobs.js";
