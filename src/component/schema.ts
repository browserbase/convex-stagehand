import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("error"),
    ),
    operation: v.union(
      v.literal("extract"),
      v.literal("act"),
      v.literal("observe"),
      v.literal("workflow"),
    ),
    url: v.string(),
    error: v.optional(v.string()),
  }).index("by_sessionId", ["sessionId"]),
});
