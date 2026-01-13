/**
 * Workflow Action
 *
 * Execute multi-step browser automation with a single session.
 * Steps can include: navigate, act, extract, observe
 */

import { action } from "./_generated/server.js";
import { v } from "convex/values";
import * as api from "./api.js";

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

    // Start session
    const session = await api.startSession(config);
    const results: any[] = [];

    try {
      // Navigate to initial URL
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      // Execute each step
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

      // End session
      await api.endSession(session.sessionId, config);

      // Return all results and the final one for convenience
      return {
        results,
        finalResult: results.length > 0 ? results[results.length - 1] : null,
      };
    } catch (error) {
      // Cleanup on error
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});
