/* eslint-disable */
/**
 * Generated component type.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * Component API type for the Stagehand component.
 * Used by the client to call component actions.
 */
export type ComponentApi = {
  lib: {
    startSession: FunctionReference<"action", "public", any, any>;
    endSession: FunctionReference<"action", "public", any, any>;
    extract: FunctionReference<"action", "public", any, any>;
    act: FunctionReference<"action", "public", any, any>;
    observe: FunctionReference<"action", "public", any, any>;
    agent: FunctionReference<"action", "public", any, any>;
  };
};
