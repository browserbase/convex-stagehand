# @convex-dev/stagehand

AI-powered browser automation for Convex applications. Extract data, perform actions, and automate workflows using natural language - no Playwright knowledge required.

## Features

- **Simple API** - Describe what you want in plain English
- **Type-safe** - Full TypeScript support with Zod schemas
- **Zero boilerplate** - Component handles session lifecycle automatically
- **Multi-step workflows** - Chain multiple operations with a single browser session
- **Powered by Stagehand** - Uses the [Stagehand](https://github.com/browserbase/stagehand) REST API

## Quick Start

### 1. Install the component

```bash
npm install @convex-dev/stagehand zod
```

### 2. Configure Convex

Add the component to your `convex/convex.config.ts`:

```typescript
import { defineApp } from "convex/server";
import stagehand from "@convex-dev/stagehand/convex.config";

const app = defineApp();
app.use(stagehand, { name: "stagehand" });

export default app;
```

### 3. Set up environment variables

Add these to your Convex dashboard (Settings → Environment Variables):

```
BROWSERBASE_API_KEY=your_browserbase_api_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id
OPENAI_API_KEY=your_openai_api_key
```

### 4. Use the component

```typescript
import { action } from "./_generated/server";
import { Stagehand } from "@convex-dev/stagehand";
import { components } from "./_generated/api";
import { z } from "zod";

const stagehand = new Stagehand(components.stagehand, {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
  modelApiKey: process.env.OPENAI_API_KEY!,
});

export const scrapeHackerNews = action({
  handler: async (ctx) => {
    return await stagehand.extract(ctx, {
      url: "https://news.ycombinator.com",
      instruction: "Extract the top 5 stories with title, score, and link",
      schema: z.object({
        stories: z.array(z.object({
          title: z.string(),
          score: z.string(),
          link: z.string(),
        }))
      })
    });
  }
});
```

## API Reference

### `extract(ctx, args)`

Extract structured data from a web page using AI.

```typescript
const data = await stagehand.extract(ctx, {
  url: "https://example.com",
  instruction: "Extract all product names and prices",
  schema: z.object({
    products: z.array(z.object({
      name: z.string(),
      price: z.string(),
    }))
  }),
  options: {
    timeout: 30000,
    waitUntil: "networkidle",
  }
});
```

**Parameters:**
- `url` - The URL to navigate to
- `instruction` - Natural language description of what to extract
- `schema` - Zod schema defining the expected output structure
- `options.timeout` - Navigation timeout in milliseconds
- `options.waitUntil` - When to consider navigation complete: `"load"`, `"domcontentloaded"`, or `"networkidle"`

**Returns:** Data matching your Zod schema

---

### `act(ctx, args)`

Execute browser actions using natural language.

```typescript
const result = await stagehand.act(ctx, {
  url: "https://example.com/login",
  action: "Click the login button and wait for the page to load",
  options: {
    timeout: 30000,
  }
});
// { success: true, message: "Clicked button...", actionDescription: "..." }
```

**Parameters:**
- `url` - The URL to navigate to
- `action` - Natural language description of the action to perform
- `options.timeout` - Navigation timeout in milliseconds
- `options.waitUntil` - When to consider navigation complete

**Returns:**
```typescript
{
  success: boolean;
  message: string;
  actionDescription: string;
}
```

---

### `observe(ctx, args)`

Find available actions on a web page.

```typescript
const actions = await stagehand.observe(ctx, {
  url: "https://example.com",
  instruction: "Find all clickable navigation links",
});
// [{ description: "Home link", selector: "a.nav-home", method: "click" }, ...]
```

**Parameters:**
- `url` - The URL to navigate to
- `instruction` - Natural language description of what actions to find
- `options.timeout` - Navigation timeout in milliseconds
- `options.waitUntil` - When to consider navigation complete

**Returns:**
```typescript
Array<{
  description: string;
  selector: string;
  method: string;
  arguments?: string[];
}>
```

---

### `workflow(ctx, args)`

Execute multi-step automation with a single browser session.

```typescript
const result = await stagehand.workflow(ctx, {
  url: "https://google.com",
  steps: [
    { type: "act", action: "Search for 'convex database'" },
    { type: "act", action: "Click the first result" },
    {
      type: "extract",
      instruction: "Get the page title and summary",
      schema: z.object({
        title: z.string(),
        summary: z.string(),
      })
    }
  ],
});
```

**Parameters:**
- `url` - The initial URL to navigate to
- `steps` - Array of steps to execute:
  - `{ type: "navigate", url: string }` - Navigate to a URL
  - `{ type: "act", action: string }` - Perform an action
  - `{ type: "extract", instruction: string, schema: ZodType }` - Extract data
  - `{ type: "observe", instruction: string }` - Find actions
- `options.timeout` - Navigation timeout in milliseconds
- `options.waitUntil` - When to consider navigation complete

**Returns:**
```typescript
{
  results: any[];  // Results from each step
  finalResult: any; // Result from the last step
}
```

## Examples

### Extract news articles

```typescript
const news = await stagehand.extract(ctx, {
  url: "https://news.ycombinator.com",
  instruction: "Get the top 10 stories with title, points, and comment count",
  schema: z.object({
    stories: z.array(z.object({
      title: z.string(),
      points: z.string(),
      comments: z.string(),
    }))
  })
});
```

### Fill out a form

```typescript
const result = await stagehand.workflow(ctx, {
  url: "https://example.com/contact",
  steps: [
    { type: "act", action: "Fill in the name field with 'John Doe'" },
    { type: "act", action: "Fill in the email field with 'john@example.com'" },
    { type: "act", action: "Fill in the message field with 'Hello!'" },
    { type: "act", action: "Click the submit button" },
  ],
});
```

### Search and extract results

```typescript
const searchResults = await stagehand.workflow(ctx, {
  url: "https://www.google.com",
  steps: [
    { type: "act", action: "Search for 'best pizza in NYC'" },
    {
      type: "extract",
      instruction: "Get the top 5 search results with title and URL",
      schema: z.object({
        results: z.array(z.object({
          title: z.string(),
          url: z.string(),
        }))
      })
    },
  ],
});
```

## Configuration Options

### AI Model

By default, the component uses `openai/gpt-4o`. You can specify a different model:

```typescript
const stagehand = new Stagehand(components.stagehand, {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
  modelApiKey: process.env.ANTHROPIC_API_KEY!, // Use Anthropic
  modelName: "anthropic/claude-3-5-sonnet-20241022",
});
```

Supported models include:
- `openai/gpt-4o` (default)
- `openai/gpt-4o-mini`
- `anthropic/claude-3-5-sonnet-20241022`
- `anthropic/claude-3-5-haiku-20241022`

## Requirements

- [Browserbase](https://browserbase.com) account and API key
- [OpenAI](https://openai.com) or [Anthropic](https://anthropic.com) API key
- Convex 1.29.3 or later

## How It Works

This component uses the [Stagehand REST API](https://stagehand.stldocs.app/api) to power browser automation. Each operation:

1. Starts a cloud browser session via Browserbase
2. Navigates to the target URL
3. Uses AI to understand the page and perform the requested operation
4. Ends the session and returns results

The component handles all session lifecycle management automatically.

## License

MIT
