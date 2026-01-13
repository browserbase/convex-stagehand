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
  GenericDataModel,
  FunctionReference,
} from "convex/server";

// Re-export component type
export type { ComponentApi } from "../component/_generated/component.js";
import type { ComponentApi } from "../component/_generated/component.js";

type ActionCtx = GenericActionCtx<GenericDataModel>;

export interface StagehandConfig {
  browserbaseApiKey: string;
  browserbaseProjectId: string;
  modelApiKey: string;
  modelName?: string;
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

export interface WorkflowOptions {
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export type WorkflowStep =
  | { type: "navigate"; url: string }
  | { type: "act"; action: string }
  | { type: "extract"; instruction: string; schema: z.ZodType }
  | { type: "observe"; instruction: string };

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

export interface WorkflowResult {
  results: any[];
  finalResult: any;
}

/**
 * Stagehand client for AI-powered browser automation.
 *
 * @example
 * ```typescript
 * import { Stagehand } from "@convex-dev/stagehand";
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
   * Extract structured data from a web page using AI.
   *
   * @param ctx - Convex action context
   * @param args - Extraction parameters
   * @returns Extracted data matching the provided schema
   *
   * @example
   * ```typescript
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
   * ```
   */
  async extract<T extends z.ZodType>(
    ctx: ActionCtx,
    args: {
      url: string;
      instruction: string;
      schema: T;
      options?: ExtractOptions;
    },
  ): Promise<z.infer<T>> {
    const jsonSchema = zodToJsonSchema(args.schema);
    return ctx.runAction(
      this.component.extract.extract as FunctionReference<"action">,
      {
        ...this.config,
        url: args.url,
        instruction: args.instruction,
        schema: jsonSchema,
        options: args.options,
      },
    );
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
   * const result = await stagehand.act(ctx, {
   *   url: "https://example.com/login",
   *   action: "Click the login button",
   * });
   * ```
   */
  async act(
    ctx: ActionCtx,
    args: {
      url: string;
      action: string;
      options?: ActOptions;
    },
  ): Promise<ActResult> {
    return ctx.runAction(
      this.component.act.act as FunctionReference<"action">,
      {
        ...this.config,
        url: args.url,
        action: args.action,
        options: args.options,
      },
    );
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
      url: string;
      instruction: string;
      options?: ObserveOptions;
    },
  ): Promise<ObservedAction[]> {
    return ctx.runAction(
      this.component.observe.observe as FunctionReference<"action">,
      {
        ...this.config,
        url: args.url,
        instruction: args.instruction,
        options: args.options,
      },
    );
  }

  /**
   * Execute a multi-step workflow with a single browser session.
   *
   * @param ctx - Convex action context
   * @param args - Workflow parameters
   * @returns Results of all steps and the final result
   *
   * @example
   * ```typescript
   * const result = await stagehand.workflow(ctx, {
   *   url: "https://google.com",
   *   steps: [
   *     { type: "act", action: "Search for 'convex database'" },
   *     { type: "extract", instruction: "Get top 3 results", schema: z.object({...}) },
   *   ],
   * });
   * ```
   */
  async workflow(
    ctx: ActionCtx,
    args: {
      url: string;
      steps: WorkflowStep[];
      options?: WorkflowOptions;
    },
  ): Promise<WorkflowResult> {
    // Convert Zod schemas in steps to JSON Schema
    const convertedSteps = args.steps.map((step) => {
      if (step.type === "extract") {
        return {
          ...step,
          schema: zodToJsonSchema(step.schema),
        };
      }
      return step;
    });

    return ctx.runAction(
      this.component.workflow.workflow as FunctionReference<"action">,
      {
        ...this.config,
        url: args.url,
        steps: convertedSteps,
        options: args.options,
      },
    );
  }
}

export default Stagehand;
