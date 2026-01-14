/**
 * Stagehand Component Library
 *
 * AI-powered browser automation actions using the Stagehand REST API.
 * All actions handle the full session lifecycle: start -> navigate -> action -> end
 */

import { action } from "./_generated/server.js";
import { v } from "convex/values";
import * as api from "./api.js";

const observedActionValidator = v.object({
  description: v.string(),
  selector: v.string(),
  method: v.string(),
  arguments: v.optional(v.array(v.string())),
});

const stepValidator = v.union(
  v.object({
    type: v.literal("navigate"),
    url: v.string(),
  }),
  v.object({
    type: v.literal("act"),
    action: v.string(),
  }),
  v.object({
    type: v.literal("extract"),
    instruction: v.string(),
    schema: v.any(),
  }),
  v.object({
    type: v.literal("observe"),
    instruction: v.string(),
  }),
);

/**
 * Extract structured data from a web page using AI.
 * Handles the full session lifecycle: start -> navigate -> extract -> end
 */
export const extract = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    url: v.string(),
    instruction: v.string(),
    schema: v.any(),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(
          v.union(
            v.literal("load"),
            v.literal("domcontentloaded"),
            v.literal("networkidle"),
          ),
        ),
      }),
    ),
  },
  returns: v.any(),
  handler: async (_ctx: any, args: any) => {
    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const session = await api.startSession(config);

    try {
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      const result = await api.extract(
        session.sessionId,
        args.instruction,
        args.schema,
        config,
      );

      await api.endSession(session.sessionId, config);

      return result.result;
    } catch (error) {
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});

/**
 * Execute browser actions using natural language instructions.
 * Handles the full session lifecycle: start -> navigate -> act -> end
 */
export const act = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    url: v.string(),
    action: v.string(),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(
          v.union(
            v.literal("load"),
            v.literal("domcontentloaded"),
            v.literal("networkidle"),
          ),
        ),
      }),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    actionDescription: v.string(),
  }),
  handler: async (_ctx: any, args: any) => {
    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const session = await api.startSession(config);

    try {
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      const result = await api.act(session.sessionId, args.action, config);

      await api.endSession(session.sessionId, config);

      return {
        success: result.result.success,
        message: result.result.message,
        actionDescription: result.result.actionDescription,
      };
    } catch (error) {
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});

/**
 * Find available actions on a web page matching an instruction.
 * Handles the full session lifecycle: start -> navigate -> observe -> end
 */
export const observe = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    url: v.string(),
    instruction: v.string(),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(
          v.union(
            v.literal("load"),
            v.literal("domcontentloaded"),
            v.literal("networkidle"),
          ),
        ),
      }),
    ),
  },
  returns: v.array(observedActionValidator),
  handler: async (_ctx: any, args: any) => {
    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const session = await api.startSession(config);

    try {
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      const result = await api.observe(
        session.sessionId,
        args.instruction,
        config,
      );

      await api.endSession(session.sessionId, config);

      return result.result.map((action) => ({
        description: action.description,
        selector: action.selector,
        method: action.method,
        arguments: action.arguments,
      }));
    } catch (error) {
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});

/**
 * Execute multi-step browser automation with a single session.
 * Steps can include: navigate, act, extract, observe
 */
export const workflow = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    url: v.string(),
    steps: v.array(stepValidator),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(
          v.union(
            v.literal("load"),
            v.literal("domcontentloaded"),
            v.literal("networkidle"),
          ),
        ),
      }),
    ),
  },
  returns: v.object({
    results: v.array(v.any()),
    finalResult: v.any(),
  }),
  handler: async (_ctx: any, args: any) => {
    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const session = await api.startSession(config);
    const results: any[] = [];

    try {
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      for (const step of args.steps) {
        let result: any;

        switch (step.type) {
          case "navigate":
            await api.navigate(session.sessionId, step.url, config, {
              waitUntil: args.options?.waitUntil,
              timeout: args.options?.timeout,
            });
            result = { type: "navigate", url: step.url, success: true };
            break;

          case "act":
            const actResult = await api.act(
              session.sessionId,
              step.action,
              config,
            );
            result = {
              type: "act",
              success: actResult.result.success,
              message: actResult.result.message,
              actionDescription: actResult.result.actionDescription,
            };
            break;

          case "extract":
            const extractResult = await api.extract(
              session.sessionId,
              step.instruction,
              step.schema,
              config,
            );
            result = { type: "extract", data: extractResult.result };
            break;

          case "observe":
            const observeResult = await api.observe(
              session.sessionId,
              step.instruction,
              config,
            );
            result = {
              type: "observe",
              actions: observeResult.result.map((a) => ({
                description: a.description,
                selector: a.selector,
                method: a.method,
              })),
            };
            break;
        }

        results.push(result);
      }

      await api.endSession(session.sessionId, config);

      return {
        results,
        finalResult: results.length > 0 ? results[results.length - 1] : null,
      };
    } catch (error) {
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});
