import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Browserbase session tracking
  sessions: defineTable({
    // Browserbase session ID
    sessionId: v.string(),
    projectId: v.string(),

    // Connection details
    connectUrl: v.string(),
    seleniumRemoteUrl: v.string(),

    // Session status from Browserbase API
    status: v.union(
      v.literal("RUNNING"),
      v.literal("ERROR"),
      v.literal("TIMED_OUT"),
      v.literal("COMPLETED"),
    ),

    // Configuration
    region: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    expiresAt: v.number(),

    // Resource metrics
    avgCpuUsage: v.optional(v.number()),
    memoryUsage: v.optional(v.number()),
    proxyBytes: v.optional(v.number()),

    // Cleanup tracking
    cleanupAttempts: v.optional(v.number()),
    cleanupStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("success"),
        v.literal("failed"),
      ),
    ),
    cleanupError: v.optional(v.string()),
    cleanupCompletedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_sessionId", ["sessionId"])
    .index("by_created", ["createdAt"]),

  // Core job tracking table for durable execution
  jobs: defineTable({
    // Link to Browserbase session (if created)
    sessionId: v.optional(v.id("sessions")),

    // Job parameters (user-defined)
    params: v.any(), // Operation-specific params

    // Browserbase configuration
    config: v.object({
      apiKey: v.string(),
      projectId: v.string(),
    }),

    // Session options
    sessionOptions: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        keepAlive: v.optional(v.boolean()),
        region: v.optional(v.string()),
        proxies: v.optional(v.boolean()),
      }),
    ),

    // User's automation action to call
    userAction: v.optional(v.string()), // FunctionHandle reference stored as string

    // Execution state
    status: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    workpoolJobId: v.optional(v.string()), // Reference to Workpool job

    // Results and outputs
    result: v.optional(v.any()), // Success result
    error: v.optional(v.string()), // Error message if failed
    screenshotStorageId: v.optional(v.id("_storage")), // Screenshot file storage ID

    // Webhooks and callbacks
    webhookUrl: v.optional(v.string()), // External webhook URL
    callbackFunction: v.optional(v.string()), // Internal Convex function name
    callbackContext: v.optional(v.any()), // Custom data to pass to callback

    // Scheduling
    scheduledFor: v.optional(v.number()), // Unix timestamp for delayed execution
    parentJobId: v.optional(v.id("jobs")), // For retry chains
    cronJobId: v.optional(v.id("cronJobs")), // For cron job instances

    // Metrics tracking
    sessionDuration: v.optional(v.number()), // Milliseconds
    operationCount: v.optional(v.number()), // Number of operations

    // Retry configuration
    retryCount: v.number(),
    maxRetries: v.number(),

    // Timeout configuration
    jobTimeout: v.optional(v.number()), // Timeout in milliseconds (default: 5 minutes)

    // Timestamps
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_sessionId", ["sessionId"])
    .index("by_scheduled", ["scheduledFor"])
    .index("by_parent", ["parentJobId"])
    .index("by_cronJob", ["cronJobId"])
    .index("by_created", ["createdAt"]),

  // Recurring automation definitions (cron jobs)
  cronJobs: defineTable({
    name: v.string(), // User-friendly name
    cronExpression: v.string(), // "0 */6 * * *" format
    enabled: v.boolean(),

    // Job parameters template
    jobParams: v.any(), // Parameters for the job

    // Browserbase configuration
    config: v.object({
      apiKey: v.string(),
      projectId: v.string(),
    }),

    // Session options
    sessionOptions: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        keepAlive: v.optional(v.boolean()),
        region: v.optional(v.string()),
        proxies: v.optional(v.boolean()),
      }),
    ),

    // User's automation action to call
    userAction: v.string(), // FunctionHandle reference

    // Webhook for results
    webhookUrl: v.optional(v.string()),
    callbackFunction: v.optional(v.string()),

    // Tracking
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.number(),
    runCount: v.number(),

    createdAt: v.number(),
  })
    .index("by_next_run", ["enabled", "nextRunAt"])
    .index("by_name", ["name"]),

  // Webhook delivery tracking
  webhookDeliveries: defineTable({
    jobId: v.id("jobs"),
    webhookUrl: v.string(),

    // Request
    payload: v.any(),
    attemptNumber: v.number(),

    // Response
    statusCode: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    error: v.optional(v.string()),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
    ),

    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),
});
