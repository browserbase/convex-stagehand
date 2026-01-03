/**
 * Job Management Module
 *
 * Public APIs for scheduling, tracking, and managing browser automation jobs.
 */

import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";

/**
 * Schedule a new browser automation job
 * Returns jobId for tracking
 */
export const scheduleJob = mutation({
  args: {
    params: v.any(), // User-defined parameters for automation
    config: v.object({
      apiKey: v.string(),
      projectId: v.string(),
    }),
    userAction: v.string(), // Function reference like "internal.myModule.myAction"
    sessionOptions: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        keepAlive: v.optional(v.boolean()),
        region: v.optional(v.string()),
        proxies: v.optional(v.boolean()),
      }),
    ),
    webhookUrl: v.optional(v.string()),
    callbackFunction: v.optional(v.string()),
    maxRetries: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
    jobTimeout: v.optional(v.number()), // Timeout in milliseconds (default: 5 minutes)
  },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    // Insert job record
    const jobId = await ctx.db.insert("jobs", {
      params: args.params,
      config: args.config,
      sessionOptions: args.sessionOptions,
      userAction: args.userAction,
      status: "pending",
      webhookUrl: args.webhookUrl,
      callbackFunction: args.callbackFunction,
      scheduledFor: args.scheduledFor,
      retryCount: 0,
      maxRetries: args.maxRetries ?? 0,
      jobTimeout: args.jobTimeout ?? DEFAULT_TIMEOUT,
      createdAt: now,
    });

    // Enqueue to executor
    await ctx.scheduler.runAfter(0, internal.executor.executeJob, { jobId });

    return jobId;
  },
});

/**
 * Get job status (reactive query)
 */
export const getJobStatus = query({
  args: { jobId: v.id("jobs") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("jobs"),
      status: v.union(
        v.literal("pending"),
        v.literal("queued"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
      result: v.optional(v.any()),
      error: v.optional(v.string()),
      retryCount: v.number(),
      maxRetries: v.number(),
      createdAt: v.number(),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      sessionDuration: v.optional(v.number()),
      session: v.union(
        v.null(),
        v.object({
          connectUrl: v.string(),
          status: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;

    // Get session details if exists
    let session = null;
    if (job.sessionId) {
      session = await ctx.db.get(job.sessionId);
    }

    return {
      id: jobId,
      status: job.status,
      result: job.result,
      error: job.error,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      sessionDuration: job.sessionDuration,
      session: session
        ? {
            connectUrl: session.connectUrl,
            status: session.status,
          }
        : null,
    };
  },
});

/**
 * List jobs with optional filtering
 */
export const listJobs = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("queued"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.id("jobs"),
      status: v.union(
        v.literal("pending"),
        v.literal("queued"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
      error: v.optional(v.string()),
      retryCount: v.number(),
      createdAt: v.number(),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { status, limit }) => {
    const jobs = status
      ? await ctx.db
          .query("jobs")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(limit ?? 50)
      : await ctx.db
          .query("jobs")
          .withIndex("by_created")
          .order("desc")
          .take(limit ?? 50);

    return jobs.map((job) => ({
      id: job._id,
      status: job.status,
      error: job.error,
      retryCount: job.retryCount,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    }));
  },
});

/**
 * Cancel a job
 */
export const cancelJob = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");

    if (job.status === "completed" || job.status === "cancelled") {
      throw new Error(`Job already ${job.status}`);
    }

    // Update job status
    await ctx.db.patch(jobId, {
      status: "cancelled",
      completedAt: Date.now(),
    });

    // Cleanup session if exists
    if (job.sessionId) {
      await ctx.scheduler.runAfter(0, internal.sessions.cleanupSession, {
        sessionRecordId: job.sessionId,
        config: job.config,
      });
    }
  },
});

/**
 * Get job details for execution (internal)
 * Called by executor
 */
export const getJobForExecution = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");

    // Get session if exists
    let session = null;
    if (job.sessionId) {
      session = await ctx.db.get(job.sessionId);
    }

    return {
      params: job.params,
      config: job.config,
      sessionOptions: job.sessionOptions,
      userAction: job.userAction,
      connectUrl: session?.connectUrl,
    };
  },
});

/**
 * Link session to job (internal)
 * Also schedules timeout watchdog
 */
export const linkSession = internalMutation({
  args: {
    jobId: v.id("jobs"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { jobId, sessionId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");

    const now = Date.now();
    const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    const timeout = job.jobTimeout ?? DEFAULT_TIMEOUT;

    // Schedule watchdog to check after timeout period
    await ctx.scheduler.runAfter(timeout, internal.timeout.watchdog, {
      jobId,
      startedAt: now,
      timeout,
    });

    await ctx.db.patch(jobId, {
      sessionId,
      status: "running",
      startedAt: now,
    });
  },
});

/**
 * Complete job successfully (internal)
 * Called by user's automation action
 */
export const completeJob = internalMutation({
  args: {
    jobId: v.id("jobs"),
    result: v.any(),
    metrics: v.optional(
      v.object({
        duration: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { jobId, result, metrics }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");

    const now = Date.now();

    await ctx.db.patch(jobId, {
      status: "completed",
      result,
      completedAt: now,
      sessionDuration: metrics?.duration,
    });

    // Trigger webhook if configured
    if (job.webhookUrl) {
      await ctx.scheduler.runAfter(0, internal.webhooks.sendWebhook, {
        jobId,
        webhookUrl: job.webhookUrl,
        attemptNumber: 1,
      });
    }

    // Cleanup session
    if (job.sessionId) {
      await ctx.scheduler.runAfter(0, internal.sessions.cleanupSession, {
        sessionRecordId: job.sessionId,
        config: job.config,
      });
    }
  },
});

/**
 * Fail job (internal)
 * Called by user's automation action or executor on error
 */
export const failJob = internalMutation({
  args: {
    jobId: v.id("jobs"),
    error: v.string(),
  },
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");

    const shouldRetry = job.retryCount < job.maxRetries;

    if (shouldRetry) {
      // Increment retry count and reschedule
      await ctx.db.patch(jobId, {
        status: "pending",
        retryCount: job.retryCount + 1,
        error,
      });

      // Cleanup current session
      if (job.sessionId) {
        await ctx.scheduler.runAfter(0, internal.sessions.cleanupSession, {
          sessionRecordId: job.sessionId,
          config: job.config,
        });
      }

      // Retry with exponential backoff
      const backoffMs = Math.pow(2, job.retryCount) * 1000;
      await ctx.scheduler.runAfter(backoffMs, internal.executor.executeJob, {
        jobId,
      });
    } else {
      // Max retries exceeded, mark as failed
      await ctx.db.patch(jobId, {
        status: "failed",
        error,
        completedAt: Date.now(),
      });

      // Trigger webhook if configured
      if (job.webhookUrl) {
        await ctx.scheduler.runAfter(0, internal.webhooks.sendWebhook, {
          jobId,
          webhookUrl: job.webhookUrl,
          attemptNumber: 1,
        });
      }

      // Cleanup session
      if (job.sessionId) {
        await ctx.scheduler.runAfter(0, internal.sessions.cleanupSession, {
          sessionRecordId: job.sessionId,
          config: job.config,
        });
      }
    }
  },
});
