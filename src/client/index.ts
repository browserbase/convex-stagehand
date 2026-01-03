/**
 * Client-side wrapper for the Browserbase component
 *
 * Provides an ergonomic API for interacting with the Browserbase component
 * from your Convex app code.
 *
 * @example
 * ```typescript
 * // In your convex.config.ts
 * import browserbase from "@convex-dev/browserbase/convex.config";
 * app.use(browserbase, { name: "browserbase" });
 *
 * // In your mutations/queries
 * import { Browserbase } from "@convex-dev/browserbase";
 * import { components } from "./_generated/api";
 *
 * const browserbase = new Browserbase(components.browserbase, {
 *   apiKey: process.env.BROWSERBASE_API_KEY!,
 *   projectId: process.env.BROWSERBASE_PROJECT_ID!,
 * });
 *
 * // Schedule a job
 * const jobId = await browserbase.scheduleJob(ctx, {
 *   params: { url: "https://example.com" },
 *   userAction: "internal.browserAutomation.scrapePageAction",
 * });
 * ```
 */

import type { MutationCtx, QueryCtx } from "../component/_generated/server.js";
import type { api } from "../component/_generated/api.js";

/**
 * Browserbase configuration
 */
export interface BrowserbaseConfig {
  apiKey: string;
  projectId: string;
}

/**
 * Session options for Browserbase
 */
export interface SessionOptions {
  timeout?: number;
  keepAlive?: boolean;
  region?: "us-west-2" | "us-east-1" | "eu-central-1" | "ap-southeast-1";
  proxies?: boolean;
}

/**
 * Job scheduling options
 */
export interface ScheduleJobOptions {
  params: any;
  userAction: string;
  sessionOptions?: SessionOptions;
  webhookUrl?: string;
  callbackFunction?: string;
  maxRetries?: number;
  scheduledFor?: number;
  jobTimeout?: number; // Timeout in milliseconds (default: 5 minutes / 300000ms)
}

/**
 * Job status
 */
export type JobStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Job status result
 */
export interface JobStatusResult {
  id: string;
  status: JobStatus;
  result?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  sessionDuration?: number;
  session: {
    connectUrl: string;
    status: string;
  } | null;
}

/**
 * Job summary
 */
export interface JobSummary {
  id: string;
  status: JobStatus;
  error?: string;
  retryCount: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Cron job options for creating recurring automation
 */
export interface CronJobOptions {
  name: string;
  cronExpression: string;
  jobParams: any;
  userAction: string;
  sessionOptions?: SessionOptions;
  webhookUrl?: string;
  callbackFunction?: string;
}

/**
 * Cron job summary
 */
export interface CronJobSummary {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  userAction: string;
  webhookUrl?: string;
  lastRunAt?: number;
  nextRunAt: number;
  runCount: number;
  createdAt: number;
}

/**
 * Browserbase component client
 *
 * Wraps the component's public API with a cleaner interface.
 */
export class Browserbase {
  private component: typeof api.browserbase;
  private config?: BrowserbaseConfig;

  /**
   * Create a new Browserbase client
   *
   * @param component - The component reference from your generated API
   * @param config - Optional default configuration (can be overridden per-job)
   *
   * @example
   * ```typescript
   * import { Browserbase } from "@convex-dev/browserbase";
   * import { components } from "./_generated/api";
   *
   * // With default config (reads from environment)
   * const browserbase = new Browserbase(components.browserbase, {
   *   apiKey: process.env.BROWSERBASE_API_KEY!,
   *   projectId: process.env.BROWSERBASE_PROJECT_ID!,
   * });
   *
   * // Without default config (must provide config per-job)
   * const browserbase = new Browserbase(components.browserbase);
   * ```
   */
  constructor(component: typeof api.browserbase, config?: BrowserbaseConfig) {
    this.component = component;
    this.config = config;
  }

  /**
   * Schedule a new browser automation job
   *
   * @param ctx - Convex mutation context
   * @param options - Job options
   * @param config - Optional config override (uses constructor config if not provided)
   * @returns Job ID for tracking
   *
   * @example
   * ```typescript
   * const jobId = await browserbase.scheduleJob(ctx, {
   *   params: { url: "https://example.com" },
   *   userAction: "internal.browserAutomation.scrapePageAction",
   *   maxRetries: 2,
   * });
   * ```
   */
  async scheduleJob(
    ctx: MutationCtx,
    options: ScheduleJobOptions,
    config?: BrowserbaseConfig,
  ): Promise<string> {
    const finalConfig = config ?? this.config;
    if (!finalConfig) {
      throw new Error(
        "Browserbase config required. Provide config in constructor or scheduleJob call.",
      );
    }

    return await ctx.runMutation(this.component.scheduleJob, {
      ...options,
      config: finalConfig,
    });
  }

  /**
   * Get job status (reactive query)
   *
   * @param ctx - Convex query context
   * @param jobId - Job ID to query
   * @returns Job status or null if not found
   *
   * @example
   * ```typescript
   * const status = await browserbase.getJobStatus(ctx, jobId);
   * if (status?.status === "completed") {
   *   console.log("Result:", status.result);
   * }
   * ```
   */
  async getJobStatus(
    ctx: QueryCtx,
    jobId: string,
  ): Promise<JobStatusResult | null> {
    return await ctx.runQuery(this.component.getJobStatus, { jobId });
  }

  /**
   * List jobs with optional filtering
   *
   * @param ctx - Convex query context
   * @param options - Filter options
   * @returns Array of job summaries
   *
   * @example
   * ```typescript
   * // Get all completed jobs
   * const completed = await browserbase.listJobs(ctx, { status: "completed" });
   *
   * // Get recent jobs
   * const recent = await browserbase.listJobs(ctx, { limit: 10 });
   * ```
   */
  async listJobs(
    ctx: QueryCtx,
    options?: { status?: JobStatus; limit?: number },
  ): Promise<JobSummary[]> {
    return await ctx.runQuery(this.component.listJobs, options ?? {});
  }

  /**
   * Cancel a running job
   *
   * @param ctx - Convex mutation context
   * @param jobId - Job ID to cancel
   *
   * @example
   * ```typescript
   * await browserbase.cancelJob(ctx, jobId);
   * ```
   */
  async cancelJob(ctx: MutationCtx, jobId: string): Promise<void> {
    await ctx.runMutation(this.component.cancelJob, { jobId });
  }

  // ========================================
  // Cron Job Management
  // ========================================

  /**
   * Create a new cron job for recurring automation
   *
   * @param ctx - Convex mutation context
   * @param options - Cron job options
   * @param config - Optional config override (uses constructor config if not provided)
   * @returns Cron job ID
   *
   * @example
   * ```typescript
   * const cronJobId = await browserbase.createCronJob(ctx, {
   *   name: "hackernews-scraper",
   *   cronExpression: "0 *\/6 * * *", // Every 6 hours
   *   jobParams: { maxStories: 10 },
   *   userAction: "internal.browserAutomation.scrapeHackerNewsAction",
   * });
   * ```
   */
  async createCronJob(
    ctx: MutationCtx,
    options: CronJobOptions,
    config?: BrowserbaseConfig,
  ): Promise<string> {
    const finalConfig = config ?? this.config;
    if (!finalConfig) {
      throw new Error(
        "Browserbase config required. Provide config in constructor or createCronJob call.",
      );
    }

    return await ctx.runMutation(this.component.createCronJob, {
      ...options,
      config: finalConfig,
    });
  }

  /**
   * Update a cron job
   *
   * @param ctx - Convex mutation context
   * @param cronJobId - Cron job ID to update
   * @param updates - Fields to update
   *
   * @example
   * ```typescript
   * // Disable a cron job
   * await browserbase.updateCronJob(ctx, cronJobId, { enabled: false });
   *
   * // Change schedule
   * await browserbase.updateCronJob(ctx, cronJobId, {
   *   cronExpression: "0 0 * * *", // Daily at midnight
   * });
   * ```
   */
  async updateCronJob(
    ctx: MutationCtx,
    cronJobId: string,
    updates: Partial<Omit<CronJobOptions, "name" | "userAction">> & {
      enabled?: boolean;
    },
  ): Promise<void> {
    await ctx.runMutation(this.component.updateCronJob, {
      cronJobId,
      ...updates,
    });
  }

  /**
   * Delete a cron job
   *
   * @param ctx - Convex mutation context
   * @param cronJobId - Cron job ID to delete
   *
   * @example
   * ```typescript
   * await browserbase.deleteCronJob(ctx, cronJobId);
   * ```
   */
  async deleteCronJob(ctx: MutationCtx, cronJobId: string): Promise<void> {
    await ctx.runMutation(this.component.deleteCronJob, { cronJobId });
  }

  /**
   * Get cron job details
   *
   * @param ctx - Convex query context
   * @param cronJobId - Cron job ID to query
   * @returns Cron job summary or null if not found
   *
   * @example
   * ```typescript
   * const cronJob = await browserbase.getCronJob(ctx, cronJobId);
   * console.log("Next run:", new Date(cronJob?.nextRunAt));
   * ```
   */
  async getCronJob(
    ctx: QueryCtx,
    cronJobId: string,
  ): Promise<CronJobSummary | null> {
    return await ctx.runQuery(this.component.getCronJob, { cronJobId });
  }

  /**
   * List cron jobs
   *
   * @param ctx - Convex query context
   * @param options - Filter options
   * @returns Array of cron job summaries
   *
   * @example
   * ```typescript
   * // Get all enabled cron jobs
   * const enabled = await browserbase.listCronJobs(ctx, { enabled: true });
   *
   * // Get all cron jobs
   * const all = await browserbase.listCronJobs(ctx);
   * ```
   */
  async listCronJobs(
    ctx: QueryCtx,
    options?: { enabled?: boolean; limit?: number },
  ): Promise<CronJobSummary[]> {
    return await ctx.runQuery(this.component.listCronJobs, options ?? {});
  }
}
