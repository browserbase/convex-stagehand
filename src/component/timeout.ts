/**
 * Timeout Watchdog Module
 *
 * Monitors running jobs and fails them if they exceed their timeout.
 */

import { internalAction, internalQuery } from "./_generated/server.js";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";

/**
 * Watchdog action - checks if job is still running and fails it if timed out
 */
export const watchdog = internalAction({
  args: {
    jobId: v.id("jobs"),
    startedAt: v.number(),
    timeout: v.number(),
  },
  handler: async (ctx, { jobId, startedAt, timeout }) => {
    // Get current job status
    const job = await ctx.runQuery(internal.timeout.getJobStatus, { jobId });

    if (!job) {
      console.log(`[Watchdog] Job ${jobId} not found, skipping`);
      return;
    }

    // Only act if job is still "running"
    if (job.status !== "running") {
      console.log(`[Watchdog] Job ${jobId} is ${job.status}, no action needed`);
      return;
    }

    const now = Date.now();
    const elapsed = now - startedAt;

    if (elapsed >= timeout) {
      console.log(
        `[Watchdog] Job ${jobId} timed out after ${elapsed}ms (limit: ${timeout}ms)`,
      );

      // Fail the job due to timeout
      await ctx.runMutation(internal.jobs.failJob, {
        jobId,
        error: `Job timed out after ${Math.round(timeout / 1000)} seconds`,
      });
    } else {
      console.log(
        `[Watchdog] Job ${jobId} still within timeout (${elapsed}ms / ${timeout}ms)`,
      );
    }
  },
});

/**
 * Get job status for watchdog check
 */
export const getJobStatus = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    return { status: job.status };
  },
});
