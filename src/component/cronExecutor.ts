/**
 * Cron Executor
 *
 * Processes due cron jobs and spawns job instances.
 * Called periodically by Convex built-in cron.
 */

import { internalAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";

/**
 * Process due cron jobs
 * This action queries for due cron jobs and spawns job instances
 */
export const processDueCronJobs = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all due cron jobs
    const dueCronJobs = await ctx.runQuery(internal.cronJobs.getDueCronJobs, {});

    console.log(`[CronExecutor] Found ${dueCronJobs.length} due cron jobs`);

    for (const cronJob of dueCronJobs) {
      try {
        // Spawn a job instance
        const jobId = await ctx.runMutation(
          internal.cronJobs.spawnCronJobInstance,
          {
            cronJobId: cronJob._id,
          },
        );

        console.log(
          `[CronExecutor] Spawned job ${jobId} for cron "${cronJob.name}"`,
        );

        // Update cron job timing
        await ctx.runMutation(internal.cronJobs.updateCronJobAfterRun, {
          cronJobId: cronJob._id,
        });
      } catch (error: any) {
        console.error(
          `[CronExecutor] Failed to process cron job "${cronJob.name}": ${error.message}`,
        );
      }
    }
  },
});
