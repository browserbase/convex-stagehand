/**
 * Act Action
 *
 * Execute browser actions using natural language instructions.
 * Handles the full session lifecycle: start -> navigate -> act -> end
 */

import { action } from "./_generated/server.js";
import { v } from "convex/values";
import * as api from "./api.js";

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

    // Start session
    const session = await api.startSession(config);

    try {
      // Navigate to URL
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      // Execute action
      const result = await api.act(session.sessionId, args.action, config);

      // End session
      await api.endSession(session.sessionId, config);

      return {
        success: result.result.success,
        message: result.result.message,
        actionDescription: result.result.actionDescription,
      };
    } catch (error) {
      // Cleanup on error
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});
