/**
 * Example usage of the Stagehand component
 */

import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Stagehand } from "../../src/client/index.js";
import { components } from "./_generated/api";
import { z } from "zod";
import { internal } from "./_generated/api";

// Initialize the Stagehand client
const stagehand = new Stagehand(components.stagehand, {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
  modelApiKey: process.env.OPENAI_API_KEY!,
  modelName: "openai/gpt-4o",
});

/**
 * Example 1: Extract data from HackerNews and save to database
 *
 * Demonstrates the complete pattern: extract data with AI and persist to Convex.
 */
export const scrapeHackerNews = action({
  args: {
    maxStories: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numStories = args.maxStories || 5;

    // Extract data using Stagehand
    const data = await stagehand.extract(ctx, {
      url: "https://news.ycombinator.com",
      instruction: `Extract the top ${numStories} stories from the front page.
                    For each story, get the title, URL, score (points), and age.`,
      schema: z.object({
        stories: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            score: z.string(),
            age: z.string(),
          }),
        ),
      }),
    });

    // Save to database
    const scrapedAt = new Date().toISOString();
    await ctx.runMutation(internal.example.saveStories, {
      stories: data.stories.map((story, index) => ({
        rank: index + 1,
        ...story,
        scrapedAt,
      })),
    });

    return {
      count: data.stories.length,
      scrapedAt,
    };
  },
});

/**
 * Example 2: Extract GitHub repository information
 *
 * Shows how to extract data from a dynamic page.
 */
export const scrapeGitHubRepo = action({
  args: {
    owner: v.string(),
    repo: v.string(),
  },
  handler: async (ctx, args) => {
    const url = `https://github.com/${args.owner}/${args.repo}`;

    const data = await stagehand.extract(ctx, {
      url,
      instruction:
        "Extract the repository name, description, star count, fork count, primary language, and license.",
      schema: z.object({
        name: z.string(),
        description: z.string(),
        stars: z.string(),
        forks: z.string(),
        language: z.string(),
        license: z.string().optional(),
      }),
    });

    return {
      ...data,
      url,
      scrapedAt: new Date().toISOString(),
    };
  },
});

/**
 * Example 3: Observe available actions on a page
 *
 * Demonstrates finding interactive elements.
 */
export const findNavLinks = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const actions = await stagehand.observe(ctx, {
      url: args.url,
      instruction: "Find all clickable navigation links in the header or navbar",
    });

    return {
      url: args.url,
      links: actions,
      count: actions.length,
    };
  },
});

/**
 * Example 4: Perform an action on a page
 *
 * Demonstrates clicking buttons and interacting with pages.
 */
export const performAction = action({
  args: {
    url: v.string(),
    actionToPerform: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await stagehand.act(ctx, {
      url: args.url,
      action: args.actionToPerform,
    });

    return result;
  },
});

/**
 * Example 5: Multi-step workflow
 *
 * Demonstrates chaining multiple actions with a single browser session.
 */
export const searchAndExtract = action({
  args: {
    searchQuery: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await stagehand.workflow(ctx, {
      url: "https://www.google.com",
      steps: [
        { type: "act", action: `Search for "${args.searchQuery}"` },
        {
          type: "extract",
          instruction: "Extract the top 3 search results with title, URL, and snippet",
          schema: z.object({
            results: z.array(
              z.object({
                title: z.string(),
                url: z.string(),
                snippet: z.string(),
              }),
            ),
          }),
        },
      ],
    });

    return {
      searchQuery: args.searchQuery,
      results: result.finalResult?.data?.results || [],
      completedAt: new Date().toISOString(),
    };
  },
});

/**
 * Example 6: E-commerce product extraction
 *
 * Real-world example of extracting product data.
 */
export const scrapeProducts = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const data = await stagehand.extract(ctx, {
      url: args.url,
      instruction: `Extract all visible products on this page.
                    For each product, get the name, price, image URL (if available),
                    and any ratings or reviews count.`,
      schema: z.object({
        products: z.array(
          z.object({
            name: z.string(),
            price: z.string(),
            imageUrl: z.string().optional(),
            rating: z.string().optional(),
            reviewCount: z.string().optional(),
          }),
        ),
        pageTitle: z.string(),
      }),
    });

    return {
      url: args.url,
      products: data.products,
      pageTitle: data.pageTitle,
      count: data.products.length,
      scrapedAt: new Date().toISOString(),
    };
  },
});

/**
 * Internal mutation to save scraped stories to the database.
 * Called by scrapeHackerNews action.
 */
export const saveStories = mutation({
  args: {
    stories: v.array(
      v.object({
        rank: v.number(),
        title: v.string(),
        url: v.string(),
        score: v.string(),
        age: v.string(),
        scrapedAt: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const story of args.stories) {
      const id = await ctx.db.insert("hackerNewsStories", story);
      ids.push(id);
    }
    return ids;
  },
});
