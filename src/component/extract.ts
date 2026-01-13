/**
 * Extract Action
 *
 * AI-powered data extraction from web pages.
 * Handles the full session lifecycle: start -> navigate -> extract -> end
 */

import { action } from "./_generated/server.js";
import { v } from "convex/values";
import * as api from "./api.js";

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

    // Start session
    const session = await api.startSession(config);

    try {
      // Navigate to URL
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      // Extract data
      const result = await api.extract(
        session.sessionId,
        args.instruction,
        args.schema,
        config,
      );

      // End session
      await api.endSession(session.sessionId, config);

      return result.result;
    } catch (error) {
      // Cleanup on error
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});
