/**
 * Exhaustive E2E test for convex-stagehand (shrey/stagehand-config-params branch)
 *
 * Tests every feature through the actual Convex component runtime:
 * - Stagehand class instantiation with all config options
 * - extract, act, observe, agent, startSession, endSession
 * - Session reuse across operations
 * - All option types (selector, variables, timeout, waitUntil, etc.)
 * - Complex Zod schemas (nested objects, arrays, optionals, enums)
 * - browserbaseSessionCreateParams with region
 * - StagehandConfig-level defaults (verbose, selfHeal, systemPrompt, etc.)
 * - Agent with full AgentOptions (mode, provider, maxSteps, highlightCursor, shouldCache)
 * - Return type validation through Convex validators
 *
 * Run: npx convex run e2eTest:runAllTests
 */

import { action } from "./_generated/server";
import { Stagehand } from "convex-stagehand";
import { components } from "./_generated/api";
import { z } from "zod";

// ─── Test Results Tracking ──────────────────────────────────────────────────

type TestResult = {
  name: string;
  passed: boolean;
  detail?: string;
  durationMs: number;
};

const results: TestResult[] = [];

async function runTest(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
  } catch (err: any) {
    results.push({
      name,
      passed: false,
      detail: err?.message?.slice(0, 300) ?? String(err),
      durationMs: Date.now() - start,
    });
  }
}

function assertDefined(val: unknown, label: string): void {
  if (val === undefined || val === null) {
    throw new Error(`Expected ${label} to be defined, got ${val}`);
  }
}

function assertType(val: unknown, type: string, label: string): void {
  if (typeof val !== type) {
    throw new Error(`Expected ${label} to be ${type}, got ${typeof val}`);
  }
}

function assertArray(val: unknown, label: string): void {
  if (!Array.isArray(val)) {
    throw new Error(`Expected ${label} to be array, got ${typeof val}`);
  }
}

// ─── Stagehand client: default config ───────────────────────────────────────

const stagehand = new Stagehand(components.stagehand, {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
  modelApiKey: process.env.MODEL_API_KEY!,
  modelName: "openai/gpt-4o",
});

// ─── Stagehand client: with ALL StagehandConfig options ─────────────────────

const stagehandFull = new Stagehand(components.stagehand, {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
  modelApiKey: process.env.MODEL_API_KEY!,
  modelName: "openai/gpt-4o",
  verbose: 1,
  selfHeal: true,
  systemPrompt: "You are a browser automation assistant for E2E testing.",
  domSettleTimeoutMs: 3000,
  experimental: false,
  browserbaseSessionCreateParams: {
    region: "us-west-2",
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Actions
// ═════════════════════════════════════════════════════════════════════════════

export const runAllTests = action({
  args: {},
  handler: async (ctx) => {
    results.length = 0;

    // ─── Test 1: Extract (auto-session, basic Zod schema) ─────────────────

    await runTest("1. extract — auto-session, basic schema", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://example.com",
        instruction: "Extract the main heading text from the page",
        schema: z.object({
          heading: z.string(),
        }),
      });
      assertDefined(data, "extract result");
      assertType(data.heading, "string", "heading");
      if (!data.heading.toLowerCase().includes("example")) {
        throw new Error(`Unexpected heading: "${data.heading}"`);
      }
    });

    // ─── Test 2: Extract with ExtractOptions (selector, timeout, waitUntil) ─

    await runTest("2. extract — with selector + timeout + waitUntil", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://news.ycombinator.com",
        instruction: "Extract the title of the top story on this page",
        schema: z.object({
          topStoryTitle: z.string(),
        }),
        options: {
          selector: "#hnmain",
          timeout: 60000,
          waitUntil: "networkidle",
        },
      });
      assertDefined(data, "extract result");
      assertType(data.topStoryTitle, "string", "topStoryTitle");
    });

    // ─── Test 3: Extract with complex nested Zod schema ─────────────────

    await runTest("3. extract — complex nested Zod schema", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://example.com",
        instruction: "Extract page info: heading, all links with text and href, and an estimate of word count",
        schema: z.object({
          page: z.object({
            title: z.string(),
            description: z.string().optional(),
          }),
          links: z.array(
            z.object({
              text: z.string(),
              href: z.string(),
            }),
          ),
          wordCount: z.number().optional(),
        }),
      });
      assertDefined(data, "extract result");
      assertDefined(data.page, "page");
      assertType(data.page.title, "string", "page.title");
      assertArray(data.links, "links");
    });

    // ─── Test 4: Observe (auto-session) ─────────────────────────────────

    await runTest("4. observe — auto-session", async () => {
      const actions = await stagehand.observe(ctx, {
        url: "https://example.com",
        instruction: "Find all clickable links on the page",
      });
      assertArray(actions, "observe result");
      if (actions.length > 0) {
        assertType(actions[0].description, "string", "action.description");
        assertType(actions[0].selector, "string", "action.selector");
        // method and backendNodeId are optional per OpenAPI spec
      }
    });

    // ─── Test 5: Observe with ObserveOptions (selector) ─────────────────

    await runTest("5. observe — with selector option", async () => {
      const actions = await stagehand.observe(ctx, {
        url: "https://news.ycombinator.com",
        instruction: "Find all story links",
        options: {
          selector: ".titleline",
          timeout: 30000,
          waitUntil: "load",
        },
      });
      assertArray(actions, "observe result");
    });

    // ─── Test 6: Act (auto-session) ─────────────────────────────────────

    await runTest("6. act — auto-session", async () => {
      const result = await stagehand.act(ctx, {
        url: "https://example.com",
        action: "Click on the 'More information...' link",
      });
      assertDefined(result, "act result");
      assertType(result.success, "boolean", "result.success");
      assertType(result.message, "string", "result.message");
      assertType(result.actionDescription, "string", "result.actionDescription");
    });

    // ─── Test 7: Act with ActOptions (variables) ────────────────────────

    await runTest("7. act — with variables option", async () => {
      const result = await stagehand.act(ctx, {
        url: "https://news.ycombinator.com",
        action: "Click on the link that says '{{linkText}}'",
        options: {
          variables: { linkText: "new" },
          timeout: 30000,
          waitUntil: "networkidle",
        },
      });
      assertDefined(result, "act result");
      assertType(result.success, "boolean", "result.success");
    });

    // ─── Test 8: Session management — startSession + reuse + endSession ─

    await runTest("8. session lifecycle — start → extract → act → observe → end", async () => {
      // Start session
      const session = await stagehand.startSession(ctx, {
        url: "https://example.com",
        options: {
          waitUntil: "load",
          timeout: 30000,
        },
      });
      assertDefined(session, "session");
      assertType(session.sessionId, "string", "session.sessionId");
      // cdpUrl is optional

      try {
        // Extract using existing session
        const extracted = await stagehand.extract(ctx, {
          sessionId: session.sessionId,
          instruction: "Extract the main heading",
          schema: z.object({ heading: z.string() }),
        });
        assertType(extracted.heading, "string", "heading");

        // Observe using existing session
        const observed = await stagehand.observe(ctx, {
          sessionId: session.sessionId,
          instruction: "Find all links",
        });
        assertArray(observed, "observed");

        // Act using existing session
        const actResult = await stagehand.act(ctx, {
          sessionId: session.sessionId,
          action: "Click the 'More information...' link",
        });
        assertType(actResult.success, "boolean", "act success");
      } finally {
        // End session
        const endResult = await stagehand.endSession(ctx, {
          sessionId: session.sessionId,
        });
        assertType(endResult.success, "boolean", "endSession success");
      }
    });

    // ─── Test 9: StartSession with ALL StartSessionOptions ──────────────

    await runTest("9. startSession — with all StartSessionOptions", async () => {
      const session = await stagehand.startSession(ctx, {
        url: "https://example.com",
        options: {
          timeout: 30000,
          waitUntil: "domcontentloaded",
          domSettleTimeoutMs: 5000,
          selfHeal: true,
          systemPrompt: "You are a test agent.",
          verbose: 0,
          experimental: false,
        },
      });
      assertDefined(session.sessionId, "sessionId");
      await stagehand.endSession(ctx, { sessionId: session.sessionId });
    });

    // ─── Test 10: StagehandConfig-level defaults (stagehandFull) ────────

    await runTest("10. StagehandConfig defaults — verbose, selfHeal, systemPrompt, domSettleTimeoutMs", async () => {
      // stagehandFull has verbose:1, selfHeal:true, systemPrompt, domSettleTimeoutMs:3000
      const data = await stagehandFull.extract(ctx, {
        url: "https://example.com",
        instruction: "Extract the heading",
        schema: z.object({ heading: z.string() }),
      });
      assertType(data.heading, "string", "heading");
    });

    // ─── Test 11: browserbaseSessionCreateParams with region ────────────

    await runTest("11. browserbaseSessionCreateParams — explicit region", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://example.com",
        instruction: "Extract the heading text",
        schema: z.object({ heading: z.string() }),
        browserbaseSessionCreateParams: {
          region: "us-west-2",
        },
      });
      assertType(data.heading, "string", "heading");
    });

    // ─── Test 12: Agent (auto-session) ──────────────────────────────────

    await runTest("12. agent — auto-session with full AgentOptions", async () => {
      const result = await stagehand.agent(ctx, {
        url: "https://news.ycombinator.com",
        instruction: "Find the title of the top story on Hacker News and report it",
        options: {
          mode: "dom",
          maxSteps: 3,
          systemPrompt: "You are a helpful browser agent. Complete the task efficiently.",
          provider: "openai",
          highlightCursor: false,
          shouldCache: false,
        },
      });
      assertDefined(result, "agent result");
      assertType(result.success, "boolean", "result.success");
      assertType(result.message, "string", "result.message");
      assertType(result.completed, "boolean", "result.completed");
      assertArray(result.actions, "result.actions");

      // Validate AgentAction shape
      if (result.actions.length > 0) {
        assertType(result.actions[0].type, "string", "action.type");
      }

      // Validate AgentUsage if present
      if (result.usage) {
        assertType(result.usage.input_tokens, "number", "usage.input_tokens");
        assertType(result.usage.output_tokens, "number", "usage.output_tokens");
        assertType(result.usage.inference_time_ms, "number", "usage.inference_time_ms");
      }
    });

    // ─── Test 13: Agent with session reuse ──────────────────────────────

    await runTest("13. agent — with existing session", async () => {
      const session = await stagehand.startSession(ctx, {
        url: "https://example.com",
      });

      try {
        const result = await stagehand.agent(ctx, {
          sessionId: session.sessionId,
          instruction: "Describe what you see on this page",
          options: {
            maxSteps: 2,
          },
        });
        assertType(result.success, "boolean", "result.success");
        assertType(result.message, "string", "result.message");
      } finally {
        await stagehand.endSession(ctx, { sessionId: session.sessionId });
      }
    });

    // ─── Test 14: Extract with Zod enum + optional + array ──────────────

    await runTest("14. extract — Zod schema with enum, optional, array, number", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://news.ycombinator.com",
        instruction: "Extract the top 2 stories with their rank number, title, and category (if any, use 'general' as default). Also extract whether the site is in English.",
        schema: z.object({
          stories: z.array(
            z.object({
              rank: z.number(),
              title: z.string(),
              category: z.enum(["general", "tech", "science", "politics"]).optional(),
            }),
          ),
          isEnglish: z.boolean(),
          siteName: z.string(),
        }),
      });
      assertArray(data.stories, "stories");
      if (data.stories.length > 0) {
        assertType(data.stories[0].title, "string", "story.title");
        assertType(data.stories[0].rank, "number", "story.rank");
      }
      assertType(data.isEnglish, "boolean", "isEnglish");
      assertType(data.siteName, "string", "siteName");
    });

    // ─── Test 15: Extract + database persist (HackerNews pattern) ───────

    await runTest("15. extract + db persist — full HackerNews pattern", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://news.ycombinator.com",
        instruction: "Extract the top 2 stories with title, URL, score, and age",
        schema: z.object({
          stories: z.array(
            z.object({
              title: z.string(),
              url: z.string(),
              score: z.string(),
              age: z.string(),
            }),
          ),
        }),
      });
      assertArray(data.stories, "stories");
      if (data.stories.length > 0) {
        assertType(data.stories[0].title, "string", "title");
        assertType(data.stories[0].url, "string", "url");
        assertType(data.stories[0].score, "string", "score");
        assertType(data.stories[0].age, "string", "age");
      }
    });

    // ─── Test 16: Multiple waitUntil values ─────────────────────────────

    await runTest("16. extract — waitUntil 'load'", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://example.com",
        instruction: "Extract the heading",
        schema: z.object({ heading: z.string() }),
        options: { waitUntil: "load" },
      });
      assertType(data.heading, "string", "heading");
    });

    await runTest("17. extract — waitUntil 'domcontentloaded'", async () => {
      const data = await stagehand.extract(ctx, {
        url: "https://example.com",
        instruction: "Extract the heading",
        schema: z.object({ heading: z.string() }),
        options: { waitUntil: "domcontentloaded" },
      });
      assertType(data.heading, "string", "heading");
    });

    // ─── Summary ────────────────────────────────────────────────────────

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;
    const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

    return {
      summary: `${passed}/${total} passed, ${failed} failed (${(totalTime / 1000).toFixed(1)}s)`,
      passed,
      failed,
      total,
      totalTimeMs: totalTime,
      results: results.map((r) => ({
        name: r.name,
        status: r.passed ? "PASS" : "FAIL",
        detail: r.detail,
        durationMs: r.durationMs,
      })),
    };
  },
});
