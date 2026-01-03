/**
 * Cron Job Management Module
 *
 * CRUD operations for recurring browser automation jobs.
 * Uses cron-parser npm package for expression parsing.
 */

import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { CronExpressionParser } from "cron-parser";

/**
 * Helper function to calculate next run time from cron expression
 */
function calculateNextRun(
  cronExpression: string,
  afterTimestamp: number,
): number {
  const expression = CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(afterTimestamp),
  });
  return expression.next().getTime();
}

/**
 * Create a new cron job definition
 */
export const createCronJob = mutation({
  args: {
    name: v.string(),
    cronExpression: v.string(),
    jobParams: v.any(),
    config: v.object({
      apiKey: v.string(),
      projectId: v.string(),
    }),
    sessionOptions: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        keepAlive: v.optional(v.boolean()),
        region: v.optional(v.string()),
        proxies: v.optional(v.boolean()),
      }),
    ),
    userAction: v.string(),
    webhookUrl: v.optional(v.string()),
    callbackFunction: v.optional(v.string()),
  },
  returns: v.id("cronJobs"),
  handler: async (ctx, args) => {
    // Validate cron expression
    try {
      CronExpressionParser.parse(args.cronExpression);
    } catch (e: any) {
      throw new Error(`Invalid cron expression: ${e.message}`);
    }

    // Check for duplicate name
    const existing = await ctx.db
      .query("cronJobs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      throw new Error(`Cron job with name "${args.name}" already exists`);
    }

    const now = Date.now();
    const nextRunAt = calculateNextRun(args.cronExpression, now);

    const cronJobId = await ctx.db.insert("cronJobs", {
      name: args.name,
      cronExpression: args.cronExpression,
      enabled: true,
      jobParams: args.jobParams,
      config: args.config,
      sessionOptions: args.sessionOptions,
      userAction: args.userAction,
      webhookUrl: args.webhookUrl,
      callbackFunction: args.callbackFunction,
      lastRunAt: undefined,
      nextRunAt,
      runCount: 0,
      createdAt: now,
    });

    return cronJobId;
  },
});

/**
 * Update cron job
 */
export const updateCronJob = mutation({
  args: {
    cronJobId: v.id("cronJobs"),
    name: v.optional(v.string()),
    cronExpression: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    jobParams: v.optional(v.any()),
    sessionOptions: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        keepAlive: v.optional(v.boolean()),
        region: v.optional(v.string()),
        proxies: v.optional(v.boolean()),
      }),
    ),
    webhookUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { cronJobId, ...updates }) => {
    const cronJob = await ctx.db.get(cronJobId);
    if (!cronJob) throw new Error("Cron job not found");

    const patchData: Record<string, any> = {};

    // Copy over provided updates
    if (updates.name !== undefined) patchData.name = updates.name;
    if (updates.enabled !== undefined) patchData.enabled = updates.enabled;
    if (updates.jobParams !== undefined) patchData.jobParams = updates.jobParams;
    if (updates.sessionOptions !== undefined)
      patchData.sessionOptions = updates.sessionOptions;
    if (updates.webhookUrl !== undefined)
      patchData.webhookUrl = updates.webhookUrl;

    // If expression changed, validate and recalculate nextRunAt
    if (updates.cronExpression !== undefined) {
      try {
        CronExpressionParser.parse(updates.cronExpression);
      } catch (e: any) {
        throw new Error(`Invalid cron expression: ${e.message}`);
      }
      patchData.cronExpression = updates.cronExpression;
      patchData.nextRunAt = calculateNextRun(updates.cronExpression, Date.now());
    }

    await ctx.db.patch(cronJobId, patchData);
    return null;
  },
});

/**
 * Delete cron job
 */
export const deleteCronJob = mutation({
  args: { cronJobId: v.id("cronJobs") },
  returns: v.null(),
  handler: async (ctx, { cronJobId }) => {
    const cronJob = await ctx.db.get(cronJobId);
    if (!cronJob) throw new Error("Cron job not found");
    await ctx.db.delete(cronJobId);
    return null;
  },
});

/**
 * Get cron job by ID
 */
export const getCronJob = query({
  args: { cronJobId: v.id("cronJobs") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("cronJobs"),
      name: v.string(),
      cronExpression: v.string(),
      enabled: v.boolean(),
      userAction: v.string(),
      webhookUrl: v.optional(v.string()),
      lastRunAt: v.optional(v.number()),
      nextRunAt: v.number(),
      runCount: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { cronJobId }) => {
    const cronJob = await ctx.db.get(cronJobId);
    if (!cronJob) return null;
    return {
      id: cronJob._id,
      name: cronJob.name,
      cronExpression: cronJob.cronExpression,
      enabled: cronJob.enabled,
      userAction: cronJob.userAction,
      webhookUrl: cronJob.webhookUrl,
      lastRunAt: cronJob.lastRunAt,
      nextRunAt: cronJob.nextRunAt,
      runCount: cronJob.runCount,
      createdAt: cronJob.createdAt,
    };
  },
});

/**
 * List all cron jobs
 */
export const listCronJobs = query({
  args: {
    enabled: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.id("cronJobs"),
      name: v.string(),
      cronExpression: v.string(),
      enabled: v.boolean(),
      userAction: v.string(),
      webhookUrl: v.optional(v.string()),
      lastRunAt: v.optional(v.number()),
      nextRunAt: v.number(),
      runCount: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { enabled, limit }) => {
    let cronJobsQuery = ctx.db.query("cronJobs");

    if (enabled !== undefined) {
      cronJobsQuery = cronJobsQuery.filter((q) =>
        q.eq(q.field("enabled"), enabled),
      );
    }

    const cronJobs = await cronJobsQuery.take(limit ?? 100);
    return cronJobs.map((cj) => ({
      id: cj._id,
      name: cj.name,
      cronExpression: cj.cronExpression,
      enabled: cj.enabled,
      userAction: cj.userAction,
      webhookUrl: cj.webhookUrl,
      lastRunAt: cj.lastRunAt,
      nextRunAt: cj.nextRunAt,
      runCount: cj.runCount,
      createdAt: cj.createdAt,
    }));
  },
});

/**
 * Internal query to get due cron jobs
 */
export const getDueCronJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Query enabled cron jobs where nextRunAt <= now
    const dueCronJobs = await ctx.db
      .query("cronJobs")
      .withIndex("by_next_run", (q) => q.eq("enabled", true).lte("nextRunAt", now))
      .take(100); // Process up to 100 at a time

    return dueCronJobs;
  },
});

/**
 * Internal mutation to update cron job after execution
 */
export const updateCronJobAfterRun = internalMutation({
  args: { cronJobId: v.id("cronJobs") },
  handler: async (ctx, { cronJobId }) => {
    const cronJob = await ctx.db.get(cronJobId);
    if (!cronJob) return;

    const now = Date.now();
    const nextRunAt = calculateNextRun(cronJob.cronExpression, now);

    await ctx.db.patch(cronJobId, {
      lastRunAt: now,
      nextRunAt,
      runCount: cronJob.runCount + 1,
    });
  },
});

/**
 * Internal mutation to spawn a job instance from cron job definition
 */
export const spawnCronJobInstance = internalMutation({
  args: { cronJobId: v.id("cronJobs") },
  returns: v.id("jobs"),
  handler: async (ctx, { cronJobId }) => {
    const cronJob = await ctx.db.get(cronJobId);
    if (!cronJob) throw new Error("Cron job not found");

    const now = Date.now();

    // Create job instance linked to parent cron job
    const jobId = await ctx.db.insert("jobs", {
      params: cronJob.jobParams,
      config: cronJob.config,
      sessionOptions: cronJob.sessionOptions,
      userAction: cronJob.userAction,
      status: "pending",
      webhookUrl: cronJob.webhookUrl,
      callbackFunction: cronJob.callbackFunction,
      cronJobId: cronJobId, // Link to cron job definition
      retryCount: 0,
      maxRetries: 0, // Cron job instances don't retry - next scheduled run handles failures
      createdAt: now,
    });

    // Enqueue to executor
    await ctx.scheduler.runAfter(0, internal.executor.executeJob, { jobId });

    return jobId;
  },
});
