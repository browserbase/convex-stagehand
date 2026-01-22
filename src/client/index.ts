/**
 * Stagehand Client
 *
 * Type-safe wrapper for the Stagehand Convex component.
 * Uses Zod schemas for extraction typing.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type {
  GenericActionCtx,
} from "convex/server";

// Re-export component type
export type { ComponentApi } from "../component/_generated/component.js";
import type { ComponentApi } from "../component/_generated/component.js";

type ActionCtx = GenericActionCtx<any>;

export interface StagehandConfig {
  browserbaseApiKey: string;
  browserbaseProjectId: string;
  modelApiKey: string;
  modelName?: string;
}

export interface SessionInfo {
  sessionId: string;
  browserbaseSessionId?: string;
  cdpUrl?: string;
}

export interface StartSessionOptions {
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  domSettleTimeoutMs?: number;
  selfHeal?: boolean;
  systemPrompt?: string;
}

export interface ExtractOptions {
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface ActOptions {
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface ObserveOptions {
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface AgentOptions {
  cua?: boolean;
  maxSteps?: number;
  systemPrompt?: string;
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface ObservedAction {
  description: string;
  selector: string;
  method: string;
  arguments?: string[];
}

export interface ActResult {
  success: boolean;
  message: string;
  actionDescription: string;
}

export interface AgentAction {
  type: string;
  action?: string;
  reasoning?: string;
  timeMs?: number;
}

export interface AgentResult {
  actions: AgentAction[];
  completed: boolean;
  message: string;
  success: boolean;
}

/**
 * Stagehand client for AI-powered browser automation.
 *
 * @example
 * ```typescript
 * import { Stagehand } from "convex-stagehand";
 * import { components } from "./_generated/api";
 *
 * const stagehand = new Stagehand(components.stagehand, {
 *   browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
 *   browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
 *   modelApiKey: process.env.OPENAI_API_KEY!,
 * });
 *
 * export const scrape = action({
 *   handler: async (ctx) => {
 *     return await stagehand.extract(ctx, {
 *       url: "https://example.com",
 *       instruction: "Extract all product names",
 *       schema: z.object({ products: z.array(z.string()) }),
 *     });
 *   },
 * });
 * ```
 */
export class Stagehand {
  constructor(
    private component: ComponentApi,
    private config: StagehandConfig,
  ) {}

  /**
   * Start a new browser session.
   * Returns session info including cdpUrl for direct Playwright/Puppeteer connection.
   *
   * @param ctx - Convex action context
   * @param args - Session parameters
   * @returns Session info with sessionId, browserbaseSessionId, and cdpUrl
   *
   * @example
   * ```typescript
   * const session = await stagehand.startSession(ctx, {
   *   url: "https://example.com",
   * });
   * // Use session.sessionId with other operations
   * // Or connect Playwright: puppeteer.connect({ browserWSEndpoint: session.cdpUrl })
   * ```
   */
  async startSession(
    ctx: ActionCtx,
    args: {
      url: string;
      browserbaseSessionId?: string;
      options?: StartSessionOptions;
    },
  ): Promise<SessionInfo> {
    return ctx.runAction(this.component.lib.startSession as any, {
      ...this.config,
      url: args.url,
      browserbaseSessionId: args.browserbaseSessionId,
      options: args.options,
    });
  }

  /**
   * End a browser session.
   *
   * @param ctx - Convex action context
   * @param args - Session to end
   * @returns Success status
   *
   * @example
   * ```typescript
   * await stagehand.endSession(ctx, { sessionId: session.sessionId });
   * ```
   */
  async endSession(
    ctx: ActionCtx,
    args: {
      sessionId: string;
    },
  ): Promise<{ success: boolean }> {
    return ctx.runAction(this.component.lib.endSession as any, {
      ...this.config,
      sessionId: args.sessionId,
    });
  }

  /**
   * Extract structured data from a web page using AI.
   *
   * @param ctx - Convex action context
   * @param args - Extraction parameters
   * @returns Extracted data matching the provided schema
   *
   * @example
   * ```typescript
   * // Without session (creates and destroys its own)
   * const data = await stagehand.extract(ctx, {
   *   url: "https://news.ycombinator.com",
   *   instruction: "Extract the top 5 stories with title and score",
   *   schema: z.object({
   *     stories: z.array(z.object({
   *       title: z.string(),
   *       score: z.string(),
   *     }))
   *   }),
   * });
   *
   * // With existing session (reuses session)
   * const data = await stagehand.extract(ctx, {
   *   sessionId: session.sessionId,
   *   instruction: "Extract the top 5 stories",
   *   schema: z.object({ ... }),
   * });
   * ```
   */
  async extract<T extends z.ZodType>(
    ctx: ActionCtx,
    args: {
      sessionId?: string;
      url?: string;
      instruction: string;
      schema: T;
      options?: ExtractOptions;
    },
  ): Promise<z.infer<T>> {
    const jsonSchema: any = zodToJsonSchema(args.schema);
    // Remove $schema field as it's reserved in Convex
    delete jsonSchema.$schema;
    return ctx.runAction(this.component.lib.extract as any, {
      ...this.config,
      sessionId: args.sessionId,
      url: args.url,
      instruction: args.instruction,
      schema: jsonSchema,
      options: args.options,
    });
  }

  /**
   * Execute a browser action using natural language.
   *
   * @param ctx - Convex action context
   * @param args - Action parameters
   * @returns Result of the action
   *
   * @example
   * ```typescript
   * // Without session
   * const result = await stagehand.act(ctx, {
   *   url: "https://example.com/login",
   *   action: "Click the login button",
   * });
   *
   * // With existing session
   * const result = await stagehand.act(ctx, {
   *   sessionId: session.sessionId,
   *   action: "Click the submit button",
   * });
   * ```
   */
  async act(
    ctx: ActionCtx,
    args: {
      sessionId?: string;
      url?: string;
      action: string;
      options?: ActOptions;
    },
  ): Promise<ActResult> {
    return ctx.runAction(this.component.lib.act as any, {
      ...this.config,
      sessionId: args.sessionId,
      url: args.url,
      action: args.action,
      options: args.options,
    });
  }

  /**
   * Find available actions on a web page.
   *
   * @param ctx - Convex action context
   * @param args - Observe parameters
   * @returns List of available actions
   *
   * @example
   * ```typescript
   * const actions = await stagehand.observe(ctx, {
   *   url: "https://example.com",
   *   instruction: "Find all navigation links",
   * });
   * ```
   */
  async observe(
    ctx: ActionCtx,
    args: {
      sessionId?: string;
      url?: string;
      instruction: string;
      options?: ObserveOptions;
    },
  ): Promise<ObservedAction[]> {
    return ctx.runAction(this.component.lib.observe as any, {
      ...this.config,
      sessionId: args.sessionId,
      url: args.url,
      instruction: args.instruction,
      options: args.options,
    });
  }

  /**
   * Execute autonomous multi-step browser automation using an AI agent.
   * The agent interprets the instruction and decides what actions to take.
   *
   * @param ctx - Convex action context
   * @param args - Agent parameters
   * @returns Agent execution result with actions taken
   *
   * @example
   * ```typescript
   * // Agent creates its own session
   * const result = await stagehand.agent(ctx, {
   *   url: "https://google.com",
   *   instruction: "Search for 'convex database' and extract the top 3 results",
   *   options: { maxSteps: 10 },
   * });
   *
   * // Agent with existing session
   * const result = await stagehand.agent(ctx, {
   *   sessionId: session.sessionId,
   *   instruction: "Fill out the form and submit",
   *   options: { maxSteps: 5 },
   * });
   * ```
   */
  async agent(
    ctx: ActionCtx,
    args: {
      sessionId?: string;
      url?: string;
      instruction: string;
      options?: AgentOptions;
    },
  ): Promise<AgentResult> {
    return ctx.runAction(this.component.lib.agent as any, {
      ...this.config,
      sessionId: args.sessionId,
      url: args.url,
      instruction: args.instruction,
      options: args.options,
    });
  }
}

export default Stagehand;
