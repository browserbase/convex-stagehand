/**
 * Stagehand Component Library
 *
 * AI-powered browser automation actions using the Stagehand REST API.
 * Supports both automatic session management and manual session control.
 */

import { action } from "./_generated/server.js";
import { v } from "convex/values";
import * as api from "./api.js";

const observedActionValidator = v.object({
  description: v.string(),
  selector: v.string(),
  method: v.optional(v.string()),
  arguments: v.optional(v.array(v.string())),
  backendNodeId: v.optional(v.number()),
});

const waitUntilValidator = v.union(
  v.literal("load"),
  v.literal("domcontentloaded"),
  v.literal("networkidle"),
);

const agentActionValidator = v.object({
  type: v.string(),
  action: v.optional(v.string()),
  reasoning: v.optional(v.string()),
  timeMs: v.optional(v.number()),
  taskCompleted: v.optional(v.boolean()),
  pageText: v.optional(v.string()),
  pageUrl: v.optional(v.string()),
  instruction: v.optional(v.string()),
});

/**
 * Start a new browser session.
 * Returns session info including cdpUrl for direct Playwright/Puppeteer connection.
 */
export const startSession = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    url: v.string(),
    browserbaseSessionID: v.optional(v.string()),
    browserbaseSessionCreateParams: v.optional(v.any()),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(waitUntilValidator),
        domSettleTimeoutMs: v.optional(v.number()),
        selfHeal: v.optional(v.boolean()),
        systemPrompt: v.optional(v.string()),
        verbose: v.optional(v.number()),
        experimental: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.object({
    sessionId: v.string(),
    cdpUrl: v.optional(v.string()),
  }),
  handler: async (_ctx: any, args: any) => {
    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const session = await api.startSession(config, {
      browserbaseSessionID: args.browserbaseSessionID,
      browserbaseSessionCreateParams: args.browserbaseSessionCreateParams,
      domSettleTimeoutMs: args.options?.domSettleTimeoutMs,
      selfHeal: args.options?.selfHeal,
      systemPrompt: args.options?.systemPrompt,
      verbose: args.options?.verbose,
      experimental: args.options?.experimental,
    });

    try {
      await api.navigate(session.sessionId, args.url, config, {
        waitUntil: args.options?.waitUntil,
        timeout: args.options?.timeout,
      });

      return {
        sessionId: session.sessionId,
        cdpUrl: session.cdpUrl ?? undefined,
      };
    } catch (error) {
      await api.endSession(session.sessionId, config);
      throw error;
    }
  },
});

/**
 * End a browser session.
 */
export const endSession = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    sessionId: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (_ctx: any, args: any) => {
    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
    };

    await api.endSession(args.sessionId, config);
    return { success: true };
  },
});

/**
 * Extract structured data from a web page using AI.
 * If sessionId is provided, uses existing session (doesn't end it).
 * Otherwise, handles full session lifecycle: start -> navigate -> extract -> end
 */
export const extract = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    url: v.optional(v.string()),
    instruction: v.string(),
    schema: v.any(),
    browserbaseSessionCreateParams: v.optional(v.any()),
    model: v.optional(v.any()),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(waitUntilValidator),
        selector: v.optional(v.string()),
      }),
    ),
  },
  returns: v.any(),
  handler: async (_ctx: any, args: any) => {
    if (!args.sessionId && !args.url) {
      throw new Error("Either sessionId or url must be provided");
    }

    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const ownSession = !args.sessionId;
    let sessionId = args.sessionId;

    if (ownSession) {
      const session = await api.startSession(config, {
        browserbaseSessionCreateParams: args.browserbaseSessionCreateParams,
      });
      sessionId = session.sessionId;
    }

    try {
      if (ownSession && args.url) {
        await api.navigate(sessionId, args.url, config, {
          waitUntil: args.options?.waitUntil,
          timeout: args.options?.timeout,
        });
      }

      const result = await api.extract(
        sessionId,
        args.instruction,
        args.schema,
        config,
        {
          model: args.model,
          timeout: args.options?.timeout,
          selector: args.options?.selector,
        },
      );

      if (ownSession) {
        await api.endSession(sessionId, config);
      }

      return result.result;
    } catch (error) {
      if (ownSession) {
        await api.endSession(sessionId, config);
      }
      throw error;
    }
  },
});

/**
 * Execute browser actions using natural language instructions.
 * If sessionId is provided, uses existing session (doesn't end it).
 * Otherwise, handles full session lifecycle: start -> navigate -> act -> end
 */
export const act = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    url: v.optional(v.string()),
    action: v.string(),
    browserbaseSessionCreateParams: v.optional(v.any()),
    model: v.optional(v.any()),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(waitUntilValidator),
        variables: v.optional(v.any()),
      }),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    actionDescription: v.string(),
  }),
  handler: async (_ctx: any, args: any) => {
    if (!args.sessionId && !args.url) {
      throw new Error("Either sessionId or url must be provided");
    }

    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const ownSession = !args.sessionId;
    let sessionId = args.sessionId;

    if (ownSession) {
      const session = await api.startSession(config, {
        browserbaseSessionCreateParams: args.browserbaseSessionCreateParams,
      });
      sessionId = session.sessionId;
    }

    try {
      if (ownSession && args.url) {
        await api.navigate(sessionId, args.url, config, {
          waitUntil: args.options?.waitUntil,
          timeout: args.options?.timeout,
        });
      }

      const result = await api.act(sessionId, args.action, config, {
        model: args.model,
        variables: args.options?.variables,
        timeout: args.options?.timeout,
      });

      if (ownSession) {
        await api.endSession(sessionId, config);
      }

      return {
        success: result.result.success,
        message: result.result.message,
        actionDescription: result.result.actionDescription,
      };
    } catch (error) {
      if (ownSession) {
        await api.endSession(sessionId, config);
      }
      throw error;
    }
  },
});

/**
 * Find available actions on a web page matching an instruction.
 * If sessionId is provided, uses existing session (doesn't end it).
 * Otherwise, handles full session lifecycle: start -> navigate -> observe -> end
 */
export const observe = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    url: v.optional(v.string()),
    instruction: v.string(),
    browserbaseSessionCreateParams: v.optional(v.any()),
    model: v.optional(v.any()),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        waitUntil: v.optional(waitUntilValidator),
        selector: v.optional(v.string()),
      }),
    ),
  },
  returns: v.array(observedActionValidator),
  handler: async (_ctx: any, args: any) => {
    if (!args.sessionId && !args.url) {
      throw new Error("Either sessionId or url must be provided");
    }

    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const ownSession = !args.sessionId;
    let sessionId = args.sessionId;

    if (ownSession) {
      const session = await api.startSession(config, {
        browserbaseSessionCreateParams: args.browserbaseSessionCreateParams,
      });
      sessionId = session.sessionId;
    }

    try {
      if (ownSession && args.url) {
        await api.navigate(sessionId, args.url, config, {
          waitUntil: args.options?.waitUntil,
          timeout: args.options?.timeout,
        });
      }

      const result = await api.observe(sessionId, args.instruction, config, {
        model: args.model,
        timeout: args.options?.timeout,
        selector: args.options?.selector,
      });

      if (ownSession) {
        await api.endSession(sessionId, config);
      }

      return result.result.map((action) => ({
        description: action.description,
        selector: action.selector,
        method: action.method,
        arguments: action.arguments,
        backendNodeId: action.backendNodeId,
      }));
    } catch (error) {
      if (ownSession) {
        await api.endSession(sessionId, config);
      }
      throw error;
    }
  },
});

/**
 * Execute autonomous multi-step browser automation using an AI agent.
 * The agent interprets the instruction and decides what actions to take.
 * If sessionId is provided, uses existing session (doesn't end it).
 * Otherwise, handles full session lifecycle.
 */
export const agent = action({
  args: {
    browserbaseApiKey: v.string(),
    browserbaseProjectId: v.string(),
    modelApiKey: v.string(),
    modelName: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    url: v.optional(v.string()),
    instruction: v.string(),
    browserbaseSessionCreateParams: v.optional(v.any()),
    model: v.optional(v.any()),
    options: v.optional(
      v.object({
        cua: v.optional(v.boolean()),
        mode: v.optional(v.string()),
        maxSteps: v.optional(v.number()),
        systemPrompt: v.optional(v.string()),
        timeout: v.optional(v.number()),
        waitUntil: v.optional(waitUntilValidator),
        executionModel: v.optional(v.any()),
        provider: v.optional(v.string()),
        highlightCursor: v.optional(v.boolean()),
        shouldCache: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.object({
    actions: v.array(agentActionValidator),
    completed: v.boolean(),
    message: v.string(),
    success: v.boolean(),
    metadata: v.optional(v.any()),
    usage: v.optional(
      v.object({
        input_tokens: v.number(),
        output_tokens: v.number(),
        reasoning_tokens: v.optional(v.number()),
        cached_input_tokens: v.optional(v.number()),
        inference_time_ms: v.number(),
      }),
    ),
  }),
  handler: async (_ctx: any, args: any) => {
    if (!args.sessionId && !args.url) {
      throw new Error("Either sessionId or url must be provided");
    }

    const config: api.ApiConfig = {
      browserbaseApiKey: args.browserbaseApiKey,
      browserbaseProjectId: args.browserbaseProjectId,
      modelApiKey: args.modelApiKey,
      modelName: args.modelName,
    };

    const ownSession = !args.sessionId;
    let sessionId = args.sessionId;

    if (ownSession) {
      const session = await api.startSession(config, {
        browserbaseSessionCreateParams: args.browserbaseSessionCreateParams,
      });
      sessionId = session.sessionId;
    }

    try {
      if (ownSession && args.url) {
        await api.navigate(sessionId, args.url, config, {
          waitUntil: args.options?.waitUntil,
          timeout: args.options?.timeout,
        });
      }

      const result = await api.agentExecute(
        sessionId,
        {
          cua: args.options?.cua,
          mode: args.options?.mode,
          model: args.model,
          systemPrompt: args.options?.systemPrompt,
          executionModel: args.options?.executionModel,
          provider: args.options?.provider,
        },
        {
          instruction: args.instruction,
          maxSteps: args.options?.maxSteps,
          highlightCursor: args.options?.highlightCursor,
        },
        config,
        args.options?.shouldCache,
      );

      if (ownSession) {
        await api.endSession(sessionId, config);
      }

      return result.result;
    } catch (error) {
      if (ownSession) {
        await api.endSession(sessionId, config);
      }
      throw error;
    }
  },
});
