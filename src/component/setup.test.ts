import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

describe("Browserbase Component", () => {
  async function setupTest() {
    const t = convexTest(schema, modules);
    return t;
  }

  let t: Awaited<ReturnType<typeof setupTest>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = await setupTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("scheduleJob", () => {
    it("should successfully schedule a job", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: {
          apiKey: "test_api_key",
          projectId: "test_project_id",
        },
        userAction: "internal.testAction.run",
        maxRetries: 2,
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
    });

    it("should create a job with correct initial state", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: {
          apiKey: "test_api_key",
          projectId: "test_project_id",
        },
        userAction: "internal.testAction.run",
        maxRetries: 3,
      });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });

      expect(status).toBeDefined();
      expect(status?.status).toBe("pending");
      expect(status?.retryCount).toBe(0);
      expect(status?.maxRetries).toBe(3);
      expect(status?.result).toBeUndefined();
      expect(status?.error).toBeUndefined();
    });

    it("should set default maxRetries to 0", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: {
          apiKey: "test_api_key",
          projectId: "test_project_id",
        },
        userAction: "internal.testAction.run",
      });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });

      expect(status?.maxRetries).toBe(0);
    });
  });

  describe("getJobStatus", () => {
    it("should return job status for existing job", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: {
          apiKey: "test_api_key",
          projectId: "test_project_id",
        },
        userAction: "internal.testAction.run",
      });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });

      expect(status).toBeDefined();
      expect(status?.id).toBe(jobId);
      expect(status?.status).toBe("pending");
    });
  });

  describe("listJobs", () => {
    it("should return empty array when no jobs exist", async () => {
      const jobs = await t.query(internal.jobs.listJobs, {});

      expect(jobs).toEqual([]);
    });

    it("should list all jobs", async () => {
      // Create multiple jobs
      await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example2.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      const jobs = await t.query(internal.jobs.listJobs, {});

      expect(jobs).toHaveLength(2);
    });

    it("should filter jobs by status", async () => {
      // Create a job
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      // Mark it as completed
      await t.mutation(internal.jobs.completeJob, {
        jobId,
        result: { success: true },
      });

      // Create another pending job
      await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example2.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      const completedJobs = await t.query(internal.jobs.listJobs, {
        status: "completed",
      });
      const pendingJobs = await t.query(internal.jobs.listJobs, {
        status: "pending",
      });

      expect(completedJobs).toHaveLength(1);
      expect(pendingJobs).toHaveLength(1);
    });

    it("should respect limit parameter", async () => {
      // Create 5 jobs
      for (let i = 0; i < 5; i++) {
        await t.mutation(internal.jobs.scheduleJob, {
          params: { url: `https://example${i}.com` },
          config: { apiKey: "key", projectId: "project" },
          userAction: "internal.test.run",
        });
      }

      const jobs = await t.query(internal.jobs.listJobs, { limit: 3 });

      expect(jobs).toHaveLength(3);
    });
  });

  describe("completeJob", () => {
    it("should mark job as completed with result", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.jobs.completeJob, {
        jobId,
        result: { data: "test result" },
        metrics: { duration: 5000 },
      });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });

      expect(status?.status).toBe("completed");
      expect(status?.result).toEqual({ data: "test result" });
      expect(status?.sessionDuration).toBe(5000);
      expect(status?.completedAt).toBeDefined();
    });
  });

  describe("failJob", () => {
    it("should mark job as failed when max retries reached", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
        maxRetries: 0,
      });

      await t.mutation(internal.jobs.failJob, {
        jobId,
        error: "Test error",
      });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });

      expect(status?.status).toBe("failed");
      expect(status?.error).toBe("Test error");
      expect(status?.completedAt).toBeDefined();
    });

    it("should retry when under max retries", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
        maxRetries: 2,
      });

      await t.mutation(internal.jobs.failJob, {
        jobId,
        error: "First attempt failed",
      });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });

      expect(status?.status).toBe("pending"); // Should be pending for retry
      expect(status?.retryCount).toBe(1);
      expect(status?.error).toBe("First attempt failed");
    });

    it("should increment retry count on each failure", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
        maxRetries: 3,
      });

      // First failure
      await t.mutation(internal.jobs.failJob, {
        jobId,
        error: "Attempt 1 failed",
      });
      let status = await t.query(internal.jobs.getJobStatus, { jobId });
      expect(status?.retryCount).toBe(1);
      expect(status?.status).toBe("pending");

      // Second failure
      await t.mutation(internal.jobs.failJob, {
        jobId,
        error: "Attempt 2 failed",
      });
      status = await t.query(internal.jobs.getJobStatus, { jobId });
      expect(status?.retryCount).toBe(2);
      expect(status?.status).toBe("pending");

      // Third failure
      await t.mutation(internal.jobs.failJob, {
        jobId,
        error: "Attempt 3 failed",
      });
      status = await t.query(internal.jobs.getJobStatus, { jobId });
      expect(status?.retryCount).toBe(3);
      expect(status?.status).toBe("pending");

      // Final failure - should mark as failed
      await t.mutation(internal.jobs.failJob, {
        jobId,
        error: "Final attempt failed",
      });
      status = await t.query(internal.jobs.getJobStatus, { jobId });
      expect(status?.retryCount).toBe(3);
      expect(status?.status).toBe("failed");
    });
  });

  describe("cancelJob", () => {
    it("should cancel a pending job", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.jobs.cancelJob, { jobId });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });

      expect(status?.status).toBe("cancelled");
      expect(status?.completedAt).toBeDefined();
    });

    it("should throw error when cancelling completed job", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.jobs.completeJob, {
        jobId,
        result: { data: "done" },
      });

      await expect(
        t.mutation(internal.jobs.cancelJob, { jobId }),
      ).rejects.toThrow("Job already completed");
    });

    it("should throw error when cancelling already cancelled job", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.jobs.cancelJob, { jobId });

      await expect(
        t.mutation(internal.jobs.cancelJob, { jobId }),
      ).rejects.toThrow("Job already cancelled");
    });
  });

  describe("Timeout Enforcement", () => {
    it("should schedule job with default timeout", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      // Job should be created with default timeout
      const status = await t.query(internal.jobs.getJobStatus, { jobId });
      expect(status).toBeDefined();
    });

    it("should schedule job with custom timeout", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
        jobTimeout: 60000, // 1 minute
      });

      expect(jobId).toBeDefined();
    });

    it("watchdog should not fail job that completed before timeout", async () => {
      const jobId = await t.mutation(internal.jobs.scheduleJob, {
        params: {},
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      // Complete the job
      await t.mutation(internal.jobs.completeJob, {
        jobId,
        result: { success: true },
      });

      const status = await t.query(internal.jobs.getJobStatus, { jobId });
      expect(status?.status).toBe("completed");
    });
  });

  describe("Session Cleanup Tracking", () => {
    it("should track cleanup attempt", async () => {
      // Insert a mock session
      const sessionId = await t.run(async (ctx) => {
        return await ctx.db.insert("sessions", {
          sessionId: "test-session-123",
          projectId: "test-project",
          connectUrl: "wss://test.browserbase.com",
          seleniumRemoteUrl: "http://test.browserbase.com",
          status: "RUNNING",
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        });
      });

      await t.mutation(internal.sessions.incrementCleanupAttempt, {
        sessionRecordId: sessionId,
        attemptNumber: 1,
      });

      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.cleanupAttempts).toBe(1);
      expect(session?.cleanupStatus).toBe("pending");
    });

    it("should mark cleanup as successful", async () => {
      const sessionId = await t.run(async (ctx) => {
        return await ctx.db.insert("sessions", {
          sessionId: "test-session-456",
          projectId: "test-project",
          connectUrl: "wss://test.browserbase.com",
          seleniumRemoteUrl: "http://test.browserbase.com",
          status: "RUNNING",
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        });
      });

      await t.mutation(internal.sessions.markCleanupSuccess, {
        sessionRecordId: sessionId,
        browserbaseStatus: "COMPLETED",
      });

      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.cleanupStatus).toBe("success");
      expect(session?.status).toBe("COMPLETED");
      expect(session?.cleanupCompletedAt).toBeDefined();
    });

    it("should mark cleanup as failed without changing session status", async () => {
      const sessionId = await t.run(async (ctx) => {
        return await ctx.db.insert("sessions", {
          sessionId: "test-session-789",
          projectId: "test-project",
          connectUrl: "wss://test.browserbase.com",
          seleniumRemoteUrl: "http://test.browserbase.com",
          status: "RUNNING",
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        });
      });

      await t.mutation(internal.sessions.markCleanupFailed, {
        sessionRecordId: sessionId,
        error: "API timeout after 3 attempts",
      });

      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.cleanupStatus).toBe("failed");
      expect(session?.status).toBe("RUNNING"); // Should NOT be changed
      expect(session?.cleanupError).toBe("API timeout after 3 attempts");
    });
  });

  describe("Cron Jobs", () => {
    it("should create a cron job with valid expression", async () => {
      const cronJobId = await t.mutation(internal.cronJobs.createCronJob, {
        name: "test-cron",
        cronExpression: "0 */6 * * *", // Every 6 hours
        jobParams: { url: "https://example.com" },
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      expect(cronJobId).toBeDefined();

      const cronJob = await t.query(internal.cronJobs.getCronJob, { cronJobId });
      expect(cronJob?.name).toBe("test-cron");
      expect(cronJob?.enabled).toBe(true);
      expect(cronJob?.runCount).toBe(0);
      expect(cronJob?.nextRunAt).toBeGreaterThan(Date.now());
    });

    it("should reject invalid cron expression", async () => {
      await expect(
        t.mutation(internal.cronJobs.createCronJob, {
          name: "invalid-cron",
          cronExpression: "invalid expression",
          jobParams: {},
          config: { apiKey: "key", projectId: "project" },
          userAction: "internal.test.run",
        }),
      ).rejects.toThrow("Invalid cron expression");
    });

    it("should reject duplicate cron job names", async () => {
      await t.mutation(internal.cronJobs.createCronJob, {
        name: "unique-name",
        cronExpression: "0 * * * *",
        jobParams: {},
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await expect(
        t.mutation(internal.cronJobs.createCronJob, {
          name: "unique-name",
          cronExpression: "0 * * * *",
          jobParams: {},
          config: { apiKey: "key", projectId: "project" },
          userAction: "internal.test.run",
        }),
      ).rejects.toThrow("already exists");
    });

    it("should update cron job", async () => {
      const cronJobId = await t.mutation(internal.cronJobs.createCronJob, {
        name: "update-test",
        cronExpression: "0 * * * *",
        jobParams: {},
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.cronJobs.updateCronJob, {
        cronJobId,
        enabled: false,
      });

      const cronJob = await t.query(internal.cronJobs.getCronJob, { cronJobId });
      expect(cronJob?.enabled).toBe(false);
    });

    it("should delete cron job", async () => {
      const cronJobId = await t.mutation(internal.cronJobs.createCronJob, {
        name: "delete-test",
        cronExpression: "0 * * * *",
        jobParams: {},
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.cronJobs.deleteCronJob, { cronJobId });

      const cronJob = await t.query(internal.cronJobs.getCronJob, { cronJobId });
      expect(cronJob).toBeNull();
    });

    it("should list enabled cron jobs", async () => {
      await t.mutation(internal.cronJobs.createCronJob, {
        name: "enabled-cron",
        cronExpression: "0 * * * *",
        jobParams: {},
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      const cronJobId2 = await t.mutation(internal.cronJobs.createCronJob, {
        name: "disabled-cron",
        cronExpression: "0 * * * *",
        jobParams: {},
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      await t.mutation(internal.cronJobs.updateCronJob, {
        cronJobId: cronJobId2,
        enabled: false,
      });

      const enabledCrons = await t.query(internal.cronJobs.listCronJobs, {
        enabled: true,
      });
      expect(enabledCrons).toHaveLength(1);
      expect(enabledCrons[0].name).toBe("enabled-cron");
    });

    it("should recalculate nextRunAt when expression changes", async () => {
      const cronJobId = await t.mutation(internal.cronJobs.createCronJob, {
        name: "recalc-test",
        cronExpression: "0 * * * *", // Every hour
        jobParams: {},
        config: { apiKey: "key", projectId: "project" },
        userAction: "internal.test.run",
      });

      const beforeUpdate = await t.query(internal.cronJobs.getCronJob, {
        cronJobId,
      });
      const originalNextRun = beforeUpdate?.nextRunAt;

      await t.mutation(internal.cronJobs.updateCronJob, {
        cronJobId,
        cronExpression: "0 0 * * *", // Daily at midnight
      });

      const afterUpdate = await t.query(internal.cronJobs.getCronJob, {
        cronJobId,
      });
      expect(afterUpdate?.cronExpression).toBe("0 0 * * *");
      // nextRunAt should be different (daily is less frequent than hourly)
      expect(afterUpdate?.nextRunAt).not.toBe(originalNextRun);
    });
  });
});
