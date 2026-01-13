/**
 * Observe Action
 *
 * Find available actions on a web page matching an instruction.
 * Handles the full session lifecycle: start -> navigate -> observe -> end
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

    // Start session
    const session = await api.startSession(config);

    try {
      // Navigate to URL
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      // Observe page
      const result = await api.observe(
        session.sessionId,
        args.instruction,
        config,
      );

      // End session
      await api.endSession(session.sessionId, config);

      return result.result.map((action) => ({
        description: action.description,
        selector: action.selector,
        method: action.method,
        arguments: action.arguments,
      }));
    } catch (error) {
      // Cleanup on error
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});
