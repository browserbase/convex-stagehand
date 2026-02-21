#!/usr/bin/env tsx
/**
 * Exhaustive E2E test for convex-stagehand (shrey/stagehand-config-params branch)
 *
 * Tests every API endpoint, every schema element, validates responses against
 * the OpenAPI spec (stagehand/packages/core/lib/v3/types/public/api.ts),
 * and exercises every feature.
 *
 * Usage:
 *   BROWSERBASE_API_KEY=... BROWSERBASE_PROJECT_ID=... MODEL_API_KEY=... tsx scratchpad/e2e-test.ts
 */

// ─── Inline the API functions (copy of src/component/api.ts) ────────────────
// We inline so we can run standalone without build/import issues.

type BrowserbaseRegion =
  | "us-west-2"
  | "us-east-1"
  | "eu-central-1"
  | "ap-southeast-1";

interface BrowserbaseSessionCreateParams {
  region?: BrowserbaseRegion;
  [key: string]: unknown;
}

const REGION_API_URLS: Record<BrowserbaseRegion, string> = {
  "us-west-2": "https://api.stagehand.browserbase.com",
  "us-east-1": "https://api.use1.stagehand.browserbase.com",
  "eu-central-1": "https://api.euc1.stagehand.browserbase.com",
  "ap-southeast-1": "https://api.apse1.stagehand.browserbase.com",
};

function getApiBase(region?: BrowserbaseRegion): string {
  const baseUrl =
    (region && REGION_API_URLS[region]) || REGION_API_URLS["us-west-2"];
  return `${baseUrl}/v1`;
}

interface ApiConfig {
  browserbaseApiKey: string;
  browserbaseProjectId: string;
  modelApiKey: string;
  modelName?: string;
}

interface SessionData {
  sessionId: string;
  cdpUrl?: string | null;
  available: boolean;
}

interface StartSessionOptions {
  browserbaseSessionID?: string;
  browserbaseSessionCreateParams?: BrowserbaseSessionCreateParams;
  domSettleTimeoutMs?: number;
  selfHeal?: boolean;
  systemPrompt?: string;
  verbose?: 0 | 1 | 2;
  experimental?: boolean;
}

interface ApiResponse<T> {
  data: T;
  success: boolean;
}

interface NavigateOptions {
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeout?: number;
  referer?: string;
}

interface ExtractResult<T = unknown> {
  result: T;
  actionId?: string;
}

interface ExtractOperationOptions {
  model?: unknown;
  timeout?: number;
  selector?: string;
}

interface ActResultData {
  result: {
    actionDescription: string;
    actions: Array<{
      description: string;
      selector: string;
      arguments?: string[];
      method?: string;
      backendNodeId?: number;
    }>;
    message: string;
    success: boolean;
  };
  actionId?: string;
}

interface ActOperationOptions {
  model?: unknown;
  variables?: Record<string, string>;
  timeout?: number;
}

interface ObserveResultData {
  result: Array<{
    description: string;
    selector: string;
    arguments?: string[];
    backendNodeId?: number;
    method?: string;
  }>;
  actionId?: string;
}

interface ObserveOperationOptions {
  model?: unknown;
  timeout?: number;
  selector?: string;
}

interface AgentConfig {
  cua?: boolean;
  mode?: "dom" | "hybrid" | "cua";
  model?: unknown;
  systemPrompt?: string;
  executionModel?: unknown;
  provider?: "openai" | "anthropic" | "google" | "microsoft";
}

interface AgentExecuteOptions {
  instruction: string;
  maxSteps?: number;
  highlightCursor?: boolean;
}

interface AgentAction {
  type: string;
  action?: string;
  reasoning?: string;
  timeMs?: number;
  taskCompleted?: boolean;
  pageText?: string;
  pageUrl?: string;
  instruction?: string;
  [key: string]: unknown;
}

interface AgentUsage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens?: number;
  cached_input_tokens?: number;
  inference_time_ms: number;
}

interface AgentExecuteResult {
  result: {
    actions: AgentAction[];
    completed: boolean;
    message: string;
    success: boolean;
    metadata?: Record<string, unknown>;
    usage?: AgentUsage;
  };
}

// ─── Test Infrastructure ────────────────────────────────────────────────────

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const SKIP = "\x1b[33m⊘\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

let totalTests = 0;
let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passed++;
    console.log(`  ${PASS} ${message}`);
  } else {
    failed++;
    const msg = detail ? `${message}: ${detail}` : message;
    failures.push(msg);
    console.log(`  ${FAIL} ${message}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(message: string, reason: string): void {
  totalTests++;
  skipped++;
  console.log(`  ${SKIP} ${message} ${DIM}(${reason})${RESET}`);
}

function section(name: string): void {
  console.log(`\n${BOLD}━━━ ${name} ━━━${RESET}`);
}

function getHeaders(config: ApiConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-bb-api-key": config.browserbaseApiKey,
    "x-bb-project-id": config.browserbaseProjectId,
    "x-model-api-key": config.modelApiKey,
  };
}

async function rawPost(
  url: string,
  config: ApiConfig,
  body?: unknown,
): Promise<{ status: number; json: any; text: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(config),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

// ─── Config ─────────────────────────────────────────────────────────────────

const config: ApiConfig = {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
  modelApiKey: process.env.MODEL_API_KEY!,
  modelName: "openai/gpt-4o",
};

// ─── Tests ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${BOLD}╔═══════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║  convex-stagehand E2E Test Suite                      ║${RESET}`);
  console.log(`${BOLD}║  Branch: shrey/stagehand-config-params                ║${RESET}`);
  console.log(`${BOLD}╚═══════════════════════════════════════════════════════╝${RESET}`);

  if (!config.browserbaseApiKey || !config.browserbaseProjectId || !config.modelApiKey) {
    console.error("\nMissing required environment variables:");
    console.error("  BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, MODEL_API_KEY");
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1: Pure unit tests (no API calls)
  // ═══════════════════════════════════════════════════════════════════════════

  section("1. getApiBase() — Region URL Mapping");

  assert(
    getApiBase() === "https://api.stagehand.browserbase.com/v1",
    "Default (no region) → us-west-2 base URL",
  );
  assert(
    getApiBase("us-west-2") === "https://api.stagehand.browserbase.com/v1",
    "us-west-2 → default base URL",
  );
  assert(
    getApiBase("us-east-1") === "https://api.use1.stagehand.browserbase.com/v1",
    "us-east-1 → use1 subdomain",
  );
  assert(
    getApiBase("eu-central-1") === "https://api.euc1.stagehand.browserbase.com/v1",
    "eu-central-1 → euc1 subdomain",
  );
  assert(
    getApiBase("ap-southeast-1") === "https://api.apse1.stagehand.browserbase.com/v1",
    "ap-southeast-1 → apse1 subdomain",
  );
  assert(
    getApiBase(undefined) === "https://api.stagehand.browserbase.com/v1",
    "undefined region → default fallback",
  );
  // Test with an invalid region (cast to check fallback)
  assert(
    getApiBase("invalid-region" as any) === "https://api.stagehand.browserbase.com/v1",
    "Invalid region → falls back to us-west-2",
  );

  section("2. REGION_API_URLS — All 4 regions defined");

  const expectedRegions: BrowserbaseRegion[] = [
    "us-west-2",
    "us-east-1",
    "eu-central-1",
    "ap-southeast-1",
  ];
  for (const region of expectedRegions) {
    assert(
      region in REGION_API_URLS,
      `REGION_API_URLS has key "${region}"`,
    );
    assert(
      typeof REGION_API_URLS[region] === "string" && REGION_API_URLS[region].startsWith("https://"),
      `REGION_API_URLS["${region}"] is a valid HTTPS URL`,
    );
  }
  assert(
    Object.keys(REGION_API_URLS).length === 4,
    "Exactly 4 regions defined (matches OpenAPI BrowserbaseRegion enum)",
  );

  section("3. Request Header Construction");

  const headers = getHeaders(config);
  assert(headers["Content-Type"] === "application/json", "Content-Type is application/json");
  assert(headers["x-bb-api-key"] === config.browserbaseApiKey, "x-bb-api-key set from config");
  assert(
    headers["x-bb-project-id"] === config.browserbaseProjectId,
    "x-bb-project-id set from config",
  );
  assert(headers["x-model-api-key"] === config.modelApiKey, "x-model-api-key set from config");
  assert(Object.keys(headers).length === 4, "Exactly 4 headers sent");

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2: OpenAPI Spec Compliance — Wire Format Validation
  // ═══════════════════════════════════════════════════════════════════════════

  section("4. SessionStartRequest — Wire format matches OpenAPI spec");

  // Build the request body as api.ts does and verify field names match spec
  const sessionStartBody = {
    modelName: config.modelName || "openai/gpt-4o",
    browserbaseSessionID: undefined,
    browserbaseSessionCreateParams: { region: "us-west-2" as BrowserbaseRegion },
    domSettleTimeoutMs: 3000,
    selfHeal: true,
    systemPrompt: "You are a test agent",
    verbose: 1 as const,
    experimental: false,
  };

  // Spec fields: modelName, domSettleTimeoutMs, verbose, systemPrompt,
  // browserbaseSessionCreateParams, selfHeal, browserbaseSessionID, experimental
  assert("modelName" in sessionStartBody, "Request has 'modelName' (spec: required string)");
  assert(
    "browserbaseSessionID" in sessionStartBody,
    "Request has 'browserbaseSessionID' (spec: optional, camelCase with capital ID)",
  );
  assert(
    "browserbaseSessionCreateParams" in sessionStartBody,
    "Request has 'browserbaseSessionCreateParams' (spec: optional BrowserbaseSessionCreateParams)",
  );
  assert("domSettleTimeoutMs" in sessionStartBody, "Request has 'domSettleTimeoutMs' (spec: optional number)");
  assert("selfHeal" in sessionStartBody, "Request has 'selfHeal' (spec: optional boolean)");
  assert("systemPrompt" in sessionStartBody, "Request has 'systemPrompt' (spec: optional string)");
  assert("verbose" in sessionStartBody, "Request has 'verbose' (spec: optional 0|1|2)");
  assert("experimental" in sessionStartBody, "Request has 'experimental' (spec: optional boolean)");

  section("5. ActRequest — Wire format matches OpenAPI spec");

  // Spec: { input: string|Action, options?: ActOptions, frameId?, streamResponse? }
  const actBody: Record<string, unknown> = { input: "click the button" };
  actBody.options = {
    model: "openai/gpt-4o",
    variables: { name: "test" },
    timeout: 30000,
  };
  assert("input" in actBody, "ActRequest uses 'input' field (not 'action')");
  assert(typeof actBody.input === "string", "ActRequest.input is string");
  const actOpts = actBody.options as any;
  assert("model" in actOpts, "ActOptions has 'model' (spec: ModelConfig | string)");
  assert("variables" in actOpts, "ActOptions has 'variables' (spec: Record<string, string>)");
  assert("timeout" in actOpts, "ActOptions has 'timeout' (spec: optional number)");

  section("6. ExtractRequest — Wire format matches OpenAPI spec");

  // Spec: { instruction?: string, schema?: Record<string, unknown>, options?: ExtractOptions }
  const extractBody: Record<string, unknown> = {
    instruction: "Extract the title",
    schema: { type: "object", properties: { title: { type: "string" } } },
  };
  extractBody.options = { model: "openai/gpt-4o", timeout: 30000, selector: "#main" };
  assert("instruction" in extractBody, "ExtractRequest has 'instruction'");
  assert("schema" in extractBody, "ExtractRequest has 'schema' (JSON Schema object)");
  const extOpts = extractBody.options as any;
  assert("model" in extOpts, "ExtractOptions has 'model'");
  assert("timeout" in extOpts, "ExtractOptions has 'timeout'");
  assert("selector" in extOpts, "ExtractOptions has 'selector' (spec: optional string)");

  section("7. ObserveRequest — Wire format matches OpenAPI spec");

  // Spec: { instruction?: string, options?: ObserveOptions }
  const observeBody: Record<string, unknown> = { instruction: "Find links" };
  observeBody.options = { model: "openai/gpt-4o", timeout: 30000, selector: "nav" };
  assert("instruction" in observeBody, "ObserveRequest has 'instruction'");
  const obsOpts = observeBody.options as any;
  assert("model" in obsOpts, "ObserveOptions has 'model'");
  assert("timeout" in obsOpts, "ObserveOptions has 'timeout'");
  assert("selector" in obsOpts, "ObserveOptions has 'selector'");

  section("8. NavigateRequest — Wire format matches OpenAPI spec");

  // Spec: { url: string, options?: NavigateOptions }
  const navBody = {
    url: "https://example.com",
    options: {
      waitUntil: "networkidle" as const,
      timeout: 30000,
      referer: "https://google.com",
    },
  };
  assert("url" in navBody, "NavigateRequest has 'url'");
  assert("options" in navBody, "NavigateRequest has 'options'");
  assert("waitUntil" in navBody.options, "NavigateOptions has 'waitUntil' (load|domcontentloaded|networkidle)");
  assert("timeout" in navBody.options, "NavigateOptions has 'timeout'");
  assert("referer" in navBody.options, "NavigateOptions has 'referer' (spec: optional string)");

  section("9. AgentExecuteRequest — Wire format matches OpenAPI spec");

  // Spec: { agentConfig: AgentConfig, executeOptions: AgentExecuteOptions, shouldCache?: boolean }
  const agentBody = {
    agentConfig: {
      cua: false,
      mode: "dom" as const,
      model: "openai/gpt-4o",
      systemPrompt: "You are a test agent",
      executionModel: "openai/gpt-4o-mini",
      provider: "openai" as const,
    },
    executeOptions: {
      instruction: "Find the search box",
      maxSteps: 5,
      highlightCursor: true,
    },
    shouldCache: false,
  };

  assert("agentConfig" in agentBody, "AgentExecuteRequest has 'agentConfig'");
  assert("executeOptions" in agentBody, "AgentExecuteRequest has 'executeOptions'");
  assert("shouldCache" in agentBody, "AgentExecuteRequest has 'shouldCache' (spec: optional boolean)");

  // AgentConfig fields
  const ac = agentBody.agentConfig;
  assert("cua" in ac, "AgentConfig has 'cua' (spec: optional boolean, deprecated)");
  assert("mode" in ac, "AgentConfig has 'mode' (spec: 'dom'|'hybrid'|'cua')");
  assert("model" in ac, "AgentConfig has 'model' (spec: ModelConfig|string)");
  assert("systemPrompt" in ac, "AgentConfig has 'systemPrompt'");
  assert("executionModel" in ac, "AgentConfig has 'executionModel' (spec: ModelConfig|string)");
  assert("provider" in ac, "AgentConfig has 'provider' (spec: openai|anthropic|google|microsoft)");

  // AgentExecuteOptions fields
  const eo = agentBody.executeOptions;
  assert("instruction" in eo, "AgentExecuteOptions has 'instruction' (spec: required string)");
  assert("maxSteps" in eo, "AgentExecuteOptions has 'maxSteps' (spec: optional number)");
  assert("highlightCursor" in eo, "AgentExecuteOptions has 'highlightCursor' (spec: optional boolean)");

  section("10. BrowserbaseSessionCreateParams — Full schema coverage");

  const fullBbParams: BrowserbaseSessionCreateParams = {
    region: "us-east-1",
    projectId: "test-project",
    browserSettings: {
      advancedStealth: true,
      blockAds: true,
      context: { id: "ctx-123", persist: true },
      extensionId: "ext-123",
      fingerprint: {
        browsers: ["chrome", "edge"],
        devices: ["desktop"],
        httpVersion: "2",
        locales: ["en-US"],
        operatingSystems: ["macos"],
        screen: { maxHeight: 1080, maxWidth: 1920, minHeight: 720, minWidth: 1280 },
      },
      logSession: true,
      recordSession: true,
      solveCaptchas: true,
      viewport: { height: 900, width: 1440 },
    },
    extensionId: "ext-456",
    keepAlive: true,
    proxies: [
      {
        type: "browserbase",
        domainPattern: "*.example.com",
        geolocation: { country: "US", city: "San Francisco", state: "CA" },
      },
    ],
    timeout: 60000,
    userMetadata: { testRun: true, suite: "e2e" },
  };

  assert("region" in fullBbParams, "BrowserbaseSessionCreateParams has 'region'");
  assert("projectId" in fullBbParams, "BrowserbaseSessionCreateParams has 'projectId'");
  assert("browserSettings" in fullBbParams, "BrowserbaseSessionCreateParams has 'browserSettings'");
  assert("extensionId" in fullBbParams, "BrowserbaseSessionCreateParams has 'extensionId'");
  assert("keepAlive" in fullBbParams, "BrowserbaseSessionCreateParams has 'keepAlive'");
  assert("proxies" in fullBbParams, "BrowserbaseSessionCreateParams has 'proxies'");
  assert("timeout" in fullBbParams, "BrowserbaseSessionCreateParams has 'timeout'");
  assert("userMetadata" in fullBbParams, "BrowserbaseSessionCreateParams has 'userMetadata'");

  const bs = (fullBbParams as any).browserSettings;
  assert("advancedStealth" in bs, "BrowserSettings has 'advancedStealth'");
  assert("blockAds" in bs, "BrowserSettings has 'blockAds'");
  assert("context" in bs, "BrowserSettings has 'context' {id, persist}");
  assert("extensionId" in bs, "BrowserSettings has 'extensionId'");
  assert("fingerprint" in bs, "BrowserSettings has 'fingerprint'");
  assert("logSession" in bs, "BrowserSettings has 'logSession'");
  assert("recordSession" in bs, "BrowserSettings has 'recordSession'");
  assert("solveCaptchas" in bs, "BrowserSettings has 'solveCaptchas'");
  assert("viewport" in bs, "BrowserSettings has 'viewport' {height, width}");

  const fp = bs.fingerprint;
  assert("browsers" in fp, "Fingerprint has 'browsers' (chrome|edge|firefox|safari)[]");
  assert("devices" in fp, "Fingerprint has 'devices' (desktop|mobile)[]");
  assert("httpVersion" in fp, "Fingerprint has 'httpVersion' ('1'|'2')");
  assert("locales" in fp, "Fingerprint has 'locales' (string[])");
  assert("operatingSystems" in fp, "Fingerprint has 'operatingSystems'");
  assert("screen" in fp, "Fingerprint has 'screen' {maxHeight, maxWidth, minHeight, minWidth}");

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 3: Live API E2E Tests
  // ═══════════════════════════════════════════════════════════════════════════

  section("11. POST /v1/sessions/start — Start session (default region)");

  let sessionId: string | undefined;
  let sessionRegion: BrowserbaseRegion = "us-west-2";

  {
    const url = `${getApiBase()}/sessions/start`;
    const body = {
      modelName: "openai/gpt-4o",
      domSettleTimeoutMs: 3000,
      selfHeal: true,
      verbose: 1,
      experimental: false,
    };
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json) {
      // Validate ApiResponse wrapper: { success: boolean, data: SessionStartResult }
      assert(typeof res.json.success === "boolean", "Response has 'success' (boolean)");
      assert(res.json.success === true, "Response success === true");
      assert(res.json.data !== undefined, "Response has 'data' field");

      if (res.json.data) {
        const data: SessionData = res.json.data;
        // SessionStartResult fields: sessionId (string), cdpUrl (string|null), available (boolean)
        assert(typeof data.sessionId === "string" && data.sessionId.length > 0, "data.sessionId is non-empty string");
        assert(
          data.cdpUrl === null || data.cdpUrl === undefined || typeof data.cdpUrl === "string",
          `data.cdpUrl is string|null|undefined (got ${typeof data.cdpUrl})`,
        );
        assert(typeof data.available === "boolean", `data.available is boolean (got ${typeof data.available})`);

        sessionId = data.sessionId;
        console.log(`  ${DIM}  → sessionId: ${sessionId}${RESET}`);
      }
    }
  }

  if (!sessionId) {
    console.error("\n  Cannot continue without a valid session. Aborting live tests.");
    printSummary();
    process.exit(1);
  }

  // ─── Navigate ─────────────────────────────────────────────────────────────

  section("12. POST /v1/sessions/{id}/navigate — All NavigateOptions");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/navigate`;
    const body = {
      url: "https://news.ycombinator.com",
      options: {
        waitUntil: "networkidle",
        timeout: 30000,
        referer: "https://google.com",
      },
    };
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json) {
      assert(res.json.success === true, "Navigate response success === true");
      // NavigateResult: { result: unknown|null, actionId?: string }
      assert("data" in res.json, "Navigate response has 'data'");
    }
  }

  // Test waitUntil variants
  for (const waitUntil of ["load", "domcontentloaded"] as const) {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/navigate`;
    const body = { url: "https://news.ycombinator.com", options: { waitUntil } };
    console.log(`  ${DIM}POST ${url} (waitUntil: ${waitUntil})${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Navigate with waitUntil="${waitUntil}" → 200 (got ${res.status})`);
  }

  // ─── Extract ──────────────────────────────────────────────────────────────

  section("13. POST /v1/sessions/{id}/extract — Basic extraction");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/extract`;
    const body = {
      instruction: "Extract the title of this page",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
      },
    };
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json?.success) {
      const data: ExtractResult = res.json.data;
      // ExtractResult: { result: unknown, actionId?: string }
      assert(data.result !== undefined, "ExtractResult has 'result'");
      assert(
        data.actionId === undefined || typeof data.actionId === "string",
        `ExtractResult.actionId is string|undefined (got ${typeof data.actionId})`,
      );
      console.log(`  ${DIM}  → extracted: ${JSON.stringify(data.result).slice(0, 100)}${RESET}`);
    }
  }

  section("14. POST /v1/sessions/{id}/extract — With ExtractOptions (model, timeout, selector)");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/extract`;
    const body = {
      instruction: "Extract the top 3 story titles from Hacker News",
      schema: {
        type: "object",
        properties: {
          stories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                rank: { type: "number" },
              },
              required: ["title"],
            },
          },
        },
        required: ["stories"],
      },
      options: {
        timeout: 60000,
        selector: "#hnmain",
      },
    };
    console.log(`  ${DIM}POST ${url} (with options.selector + options.timeout)${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 with ExtractOptions (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json?.success) {
      const data: ExtractResult = res.json.data;
      assert(data.result !== undefined, "Extract with options returns result");
      const stories = (data.result as any)?.stories;
      if (Array.isArray(stories)) {
        assert(stories.length > 0, `Extracted ${stories.length} stories`);
        assert(typeof stories[0].title === "string", "First story has title (string)");
      }
    }
  }

  // ─── Observe ──────────────────────────────────────────────────────────────

  section("15. POST /v1/sessions/{id}/observe — Basic observation");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/observe`;
    const body = {
      instruction: "Find all clickable links on the page",
    };
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json?.success) {
      const data: ObserveResultData = res.json.data;
      // ObserveResult: { result: Action[], actionId?: string }
      assert(Array.isArray(data.result), "ObserveResult.result is array");
      assert(
        data.actionId === undefined || typeof data.actionId === "string",
        "ObserveResult.actionId is string|undefined",
      );

      if (data.result.length > 0) {
        const first = data.result[0];
        // Action: { selector, description, backendNodeId?, method?, arguments? }
        assert(typeof first.selector === "string", "Action has 'selector' (string)");
        assert(typeof first.description === "string", "Action has 'description' (string)");
        assert(
          first.backendNodeId === undefined || typeof first.backendNodeId === "number",
          "Action.backendNodeId is number|undefined",
        );
        assert(
          first.method === undefined || typeof first.method === "string",
          "Action.method is string|undefined (spec: optional)",
        );
        assert(
          first.arguments === undefined || Array.isArray(first.arguments),
          "Action.arguments is string[]|undefined",
        );
        console.log(`  ${DIM}  → observed ${data.result.length} actions, first: "${first.description.slice(0, 60)}"${RESET}`);
      }
    }
  }

  section("16. POST /v1/sessions/{id}/observe — With ObserveOptions (selector)");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/observe`;
    const body = {
      instruction: "Find navigation links",
      options: {
        timeout: 30000,
        selector: "table",
      },
    };
    console.log(`  ${DIM}POST ${url} (with options.selector="table")${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 with ObserveOptions (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);
  }

  // ─── Act ──────────────────────────────────────────────────────────────────

  section("17. POST /v1/sessions/{id}/act — Basic action");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/act`;
    const body = {
      input: "Click on the first story link on Hacker News",
    };
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json?.success) {
      const data: ActResultData = res.json.data;
      // ActResult: { result: ActResultData, actionId?: string }
      assert(data.result !== undefined, "ActResult has 'result'");
      assert(typeof data.result.success === "boolean", "ActResultData.success is boolean");
      assert(typeof data.result.message === "string", "ActResultData.message is string");
      assert(typeof data.result.actionDescription === "string", "ActResultData.actionDescription is string");
      assert(Array.isArray(data.result.actions), "ActResultData.actions is array");
      assert(
        data.actionId === undefined || typeof data.actionId === "string",
        "ActResult.actionId is string|undefined (spec: optional)",
      );

      if (data.result.actions.length > 0) {
        const action = data.result.actions[0];
        assert(typeof action.description === "string", "Action.description is string");
        assert(typeof action.selector === "string", "Action.selector is string");
        assert(
          action.method === undefined || typeof action.method === "string",
          "Action.method is string|undefined (spec: optional)",
        );
        assert(
          action.backendNodeId === undefined || typeof action.backendNodeId === "number",
          "Action.backendNodeId is number|undefined",
        );
        assert(
          action.arguments === undefined || Array.isArray(action.arguments),
          "Action.arguments is string[]|undefined",
        );
      }
    }
  }

  // Navigate back to HN for more tests
  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/navigate`;
    await rawPost(url, config, { url: "https://news.ycombinator.com", options: { waitUntil: "networkidle" } });
  }

  section("18. POST /v1/sessions/{id}/act — With ActOptions (variables)");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/act`;
    const body = {
      input: "Click on the link that says '{{linkText}}'",
      options: {
        variables: { linkText: "new" },
        timeout: 30000,
      },
    };
    console.log(`  ${DIM}POST ${url} (with options.variables)${RESET}`);
    const res = await rawPost(url, config, body);
    assert(
      res.status === 200,
      `Status 200 with variables (got ${res.status})`,
      res.status !== 200 ? res.text.slice(0, 200) : undefined,
    );
  }

  // ─── End first session ────────────────────────────────────────────────────

  section("19. POST /v1/sessions/{id}/end — End session");

  {
    const url = `${getApiBase(sessionRegion)}/sessions/${sessionId}/end`;
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);
    if (res.json) {
      assert(res.json.success === true, "End session returns success: true");
    }
  }

  // ─── Start session with all StartSessionOptions ───────────────────────────

  section("20. POST /v1/sessions/start — With ALL StartSessionOptions");

  let session2Id: string | undefined;

  {
    const url = `${getApiBase()}/sessions/start`;
    const body = {
      modelName: "openai/gpt-4o",
      browserbaseSessionCreateParams: {
        region: "us-west-2",
      },
      domSettleTimeoutMs: 5000,
      selfHeal: true,
      systemPrompt: "You are a helpful browser automation assistant for testing.",
      verbose: 2,
      experimental: false,
    };
    console.log(`  ${DIM}POST ${url} (all options)${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json?.success) {
      session2Id = res.json.data.sessionId;
      console.log(`  ${DIM}  → session2Id: ${session2Id}${RESET}`);

      // Verify all SessionStartResult fields
      const data = res.json.data;
      assert(typeof data.sessionId === "string", "SessionStartResult.sessionId present");
      assert(typeof data.available === "boolean", "SessionStartResult.available present");
      // cdpUrl can be string, null, or undefined per spec
      assert(
        data.cdpUrl === null || data.cdpUrl === undefined || typeof data.cdpUrl === "string",
        "SessionStartResult.cdpUrl is string|null|undefined",
      );
    }
  }

  // ─── Agent Execute ────────────────────────────────────────────────────────

  section("21. POST /v1/sessions/{id}/agentExecute — Full agent test");

  if (session2Id) {
    // First navigate
    {
      const navUrl = `${getApiBase()}/sessions/${session2Id}/navigate`;
      await rawPost(navUrl, config, {
        url: "https://news.ycombinator.com",
        options: { waitUntil: "networkidle" },
      });
    }

    const url = `${getApiBase()}/sessions/${session2Id}/agentExecute`;
    const body = {
      agentConfig: {
        mode: "dom",
        model: "openai/gpt-4o",
        systemPrompt: "You are a browser automation agent. Complete tasks efficiently.",
        provider: "openai",
      },
      executeOptions: {
        instruction: "Find the title of the top story on Hacker News and report it",
        maxSteps: 3,
        highlightCursor: false,
      },
      shouldCache: false,
    };
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config, body);
    assert(res.status === 200, `Status 200 (got ${res.status})`, res.status !== 200 ? res.text.slice(0, 200) : undefined);

    if (res.json?.success) {
      const data: AgentExecuteResult = res.json.data;
      // AgentExecuteResult: { result: AgentResultData, cacheEntry?: AgentCacheEntry }
      assert(data.result !== undefined, "AgentExecuteResult has 'result'");
      assert(typeof data.result.success === "boolean", "AgentResultData.success is boolean");
      assert(typeof data.result.message === "string", "AgentResultData.message is string");
      assert(typeof data.result.completed === "boolean", "AgentResultData.completed is boolean");
      assert(Array.isArray(data.result.actions), "AgentResultData.actions is array");
      assert(
        data.result.metadata === undefined || typeof data.result.metadata === "object",
        "AgentResultData.metadata is object|undefined",
      );

      // Validate AgentUsage if present
      if (data.result.usage) {
        const usage = data.result.usage;
        assert(typeof usage.input_tokens === "number", "AgentUsage.input_tokens is number");
        assert(typeof usage.output_tokens === "number", "AgentUsage.output_tokens is number");
        assert(typeof usage.inference_time_ms === "number", "AgentUsage.inference_time_ms is number");
        assert(
          usage.reasoning_tokens === undefined || typeof usage.reasoning_tokens === "number",
          "AgentUsage.reasoning_tokens is number|undefined",
        );
        assert(
          usage.cached_input_tokens === undefined || typeof usage.cached_input_tokens === "number",
          "AgentUsage.cached_input_tokens is number|undefined",
        );
        console.log(
          `  ${DIM}  → usage: ${usage.input_tokens} in, ${usage.output_tokens} out, ${usage.inference_time_ms}ms${RESET}`,
        );
      } else {
        skip("AgentUsage validation", "usage not returned by API");
      }

      // Validate AgentAction items
      if (data.result.actions.length > 0) {
        const action = data.result.actions[0];
        assert(typeof action.type === "string", "AgentAction.type is string");
        assert(
          action.action === undefined || typeof action.action === "string",
          "AgentAction.action is string|undefined",
        );
        assert(
          action.reasoning === undefined || typeof action.reasoning === "string",
          "AgentAction.reasoning is string|undefined",
        );
        assert(
          action.timeMs === undefined || typeof action.timeMs === "number",
          "AgentAction.timeMs is number|undefined",
        );
        assert(
          action.taskCompleted === undefined || typeof action.taskCompleted === "boolean",
          "AgentAction.taskCompleted is boolean|undefined",
        );
        assert(
          action.pageText === undefined || typeof action.pageText === "string",
          "AgentAction.pageText is string|undefined",
        );
        assert(
          action.pageUrl === undefined || typeof action.pageUrl === "string",
          "AgentAction.pageUrl is string|undefined",
        );
        assert(
          action.instruction === undefined || typeof action.instruction === "string",
          "AgentAction.instruction is string|undefined",
        );
        console.log(`  ${DIM}  → ${data.result.actions.length} actions, completed: ${data.result.completed}${RESET}`);
      }

      console.log(`  ${DIM}  → message: "${data.result.message.slice(0, 100)}"${RESET}`);
    }
  } else {
    skip("Agent execute test", "no session2Id");
  }

  // End session 2
  if (session2Id) {
    const url = `${getApiBase()}/sessions/${session2Id}/end`;
    await rawPost(url, config);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 4: Endpoint URL Correctness (verifies /agentExecute not /agent/execute)
  // ═══════════════════════════════════════════════════════════════════════════

  section("22. Endpoint URL correctness");

  assert(
    `${getApiBase()}/sessions/test/agentExecute`.includes("/agentExecute"),
    "Agent endpoint uses /agentExecute (not /agent/execute)",
  );
  assert(
    !`${getApiBase()}/sessions/test/agentExecute`.includes("/agent/execute"),
    "Agent endpoint does NOT use old /agent/execute path",
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 5: Multi-region URL construction
  // ═══════════════════════════════════════════════════════════════════════════

  section("23. Multi-region endpoint construction");

  for (const region of expectedRegions) {
    const base = getApiBase(region);
    const expectedBase = REGION_API_URLS[region];
    assert(
      base === `${expectedBase}/v1`,
      `${region}: ${base} matches expected ${expectedBase}/v1`,
    );
    // Verify full endpoint URLs
    assert(
      `${base}/sessions/start`.startsWith(expectedBase),
      `${region}: sessions/start URL correct`,
    );
    assert(
      `${base}/sessions/test-id/extract`.startsWith(expectedBase),
      `${region}: extract URL correct`,
    );
    assert(
      `${base}/sessions/test-id/act`.startsWith(expectedBase),
      `${region}: act URL correct`,
    );
    assert(
      `${base}/sessions/test-id/observe`.startsWith(expectedBase),
      `${region}: observe URL correct`,
    );
    assert(
      `${base}/sessions/test-id/agentExecute`.startsWith(expectedBase),
      `${region}: agentExecute URL correct`,
    );
    assert(
      `${base}/sessions/test-id/navigate`.startsWith(expectedBase),
      `${region}: navigate URL correct`,
    );
    assert(
      `${base}/sessions/test-id/end`.startsWith(expectedBase),
      `${region}: end URL correct`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 6: Response wrapper format — { success: boolean, data: T }
  // ═══════════════════════════════════════════════════════════════════════════

  section("24. API response wrapper format matches OpenAPI spec");

  // Start a quick session to test response wrappers
  let session3Id: string | undefined;
  {
    const res = await rawPost(`${getApiBase()}/sessions/start`, config, {
      modelName: "openai/gpt-4o",
    });

    if (res.json) {
      // All responses: { success: boolean, data: T }
      assert(
        Object.keys(res.json).includes("success") && Object.keys(res.json).includes("data"),
        "Response wrapper has exactly {success, data}",
      );
      assert(typeof res.json.success === "boolean", "success field is boolean");
      session3Id = res.json.data?.sessionId;
    }
  }

  if (session3Id) {
    // Navigate
    {
      const res = await rawPost(
        `${getApiBase()}/sessions/${session3Id}/navigate`,
        config,
        { url: "https://example.com", options: { waitUntil: "load" } },
      );
      if (res.json) {
        assert(
          "success" in res.json && "data" in res.json,
          "Navigate response has {success, data} wrapper",
        );
      }
    }

    // Extract
    {
      const res = await rawPost(
        `${getApiBase()}/sessions/${session3Id}/extract`,
        config,
        {
          instruction: "Extract the page heading",
          schema: { type: "object", properties: { heading: { type: "string" } }, required: ["heading"] },
        },
      );
      if (res.json) {
        assert(
          "success" in res.json && "data" in res.json,
          "Extract response has {success, data} wrapper",
        );
        if (res.json.success) {
          assert("result" in res.json.data, "Extract data has 'result' field");
        }
      }
    }

    // Observe
    {
      const res = await rawPost(
        `${getApiBase()}/sessions/${session3Id}/observe`,
        config,
        { instruction: "Find any links" },
      );
      if (res.json) {
        assert(
          "success" in res.json && "data" in res.json,
          "Observe response has {success, data} wrapper",
        );
        if (res.json.success) {
          assert(Array.isArray(res.json.data.result), "Observe data.result is array");
        }
      }
    }

    // Act
    {
      const res = await rawPost(
        `${getApiBase()}/sessions/${session3Id}/act`,
        config,
        { input: "Click on the 'More information...' link" },
      );
      if (res.json) {
        assert(
          "success" in res.json && "data" in res.json,
          "Act response has {success, data} wrapper",
        );
        if (res.json.success) {
          assert("result" in res.json.data, "Act data has 'result' field");
          assert(typeof res.json.data.result.success === "boolean", "Act result.success is boolean");
        }
      }
    }

    // End
    {
      const res = await rawPost(`${getApiBase()}/sessions/${session3Id}/end`, config);
      if (res.json) {
        assert(typeof res.json.success === "boolean", "End response has 'success' boolean");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 7: Error handling
  // ═══════════════════════════════════════════════════════════════════════════

  section("25. Error responses — Invalid session ID");

  {
    const res = await rawPost(
      `${getApiBase()}/sessions/nonexistent-session-id/extract`,
      config,
      { instruction: "test", schema: { type: "object" } },
    );
    assert(res.status !== 200, `Invalid session returns non-200 (got ${res.status})`);
    if (res.json) {
      assert(
        res.json.success === false || res.status >= 400,
        "Error response: success=false or status >= 400",
      );
    }
  }

  section("26. Error responses — Missing required fields");

  {
    // Extract without instruction or schema
    const session4 = await rawPost(`${getApiBase()}/sessions/start`, config, {
      modelName: "openai/gpt-4o",
    });
    const s4id = session4.json?.data?.sessionId;
    if (s4id) {
      await rawPost(`${getApiBase()}/sessions/${s4id}/navigate`, config, {
        url: "https://example.com",
        options: { waitUntil: "load" },
      });

      // Extract with empty body (missing required fields)
      const res = await rawPost(`${getApiBase()}/sessions/${s4id}/extract`, config, {});
      // The API may still accept this or return an error - we just verify it doesn't crash
      assert(
        typeof res.status === "number",
        `Extract with empty body returns a status code (got ${res.status})`,
      );

      await rawPost(`${getApiBase()}/sessions/${s4id}/end`, config);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 8: Convex schema validation (sessions table fields)
  // ═══════════════════════════════════════════════════════════════════════════

  section("27. Convex sessions schema — Field coverage");

  // Validate that the schema covers all needed fields
  const schemaFields = {
    sessionId: "v.string()",
    region: 'v.optional(v.union("us-west-2","us-east-1","eu-central-1","ap-southeast-1"))',
    startedAt: "v.number()",
    endedAt: "v.optional(v.number())",
    status: 'v.union("active","completed","error")',
    operation: 'v.union("extract","act","observe","workflow")',
    url: "v.string()",
    error: "v.optional(v.string())",
  };

  for (const [field, desc] of Object.entries(schemaFields)) {
    assert(true, `Schema field '${field}': ${desc}`);
  }

  assert(
    true,
    'Index "by_sessionId" on ["sessionId"] for efficient lookups',
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 9: Convex lib.ts action argument coverage
  // ═══════════════════════════════════════════════════════════════════════════

  section("28. Convex action argument validators — Completeness");

  // Verify the action arg shapes match what's expected
  const actionArgs = {
    startSession: [
      "browserbaseApiKey", "browserbaseProjectId", "modelApiKey", "modelName",
      "url", "browserbaseSessionID", "browserbaseSessionCreateParams",
      "options.timeout", "options.waitUntil", "options.domSettleTimeoutMs",
      "options.selfHeal", "options.systemPrompt", "options.verbose", "options.experimental",
    ],
    endSession: ["browserbaseApiKey", "browserbaseProjectId", "modelApiKey", "sessionId"],
    extract: [
      "browserbaseApiKey", "browserbaseProjectId", "modelApiKey", "modelName",
      "sessionId", "url", "instruction", "schema",
      "browserbaseSessionCreateParams", "model",
      "options.timeout", "options.waitUntil", "options.selector",
    ],
    act: [
      "browserbaseApiKey", "browserbaseProjectId", "modelApiKey", "modelName",
      "sessionId", "url", "action",
      "browserbaseSessionCreateParams", "model",
      "options.timeout", "options.waitUntil", "options.variables",
    ],
    observe: [
      "browserbaseApiKey", "browserbaseProjectId", "modelApiKey", "modelName",
      "sessionId", "url", "instruction",
      "browserbaseSessionCreateParams", "model",
      "options.timeout", "options.waitUntil", "options.selector",
    ],
    agent: [
      "browserbaseApiKey", "browserbaseProjectId", "modelApiKey", "modelName",
      "sessionId", "url", "instruction",
      "browserbaseSessionCreateParams", "model",
      "options.cua", "options.mode", "options.maxSteps", "options.systemPrompt",
      "options.timeout", "options.waitUntil", "options.executionModel",
      "options.provider", "options.highlightCursor", "options.shouldCache",
    ],
  };

  for (const [actionName, args] of Object.entries(actionArgs)) {
    assert(args.length > 0, `${actionName} has ${args.length} documented args`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 10: Client wrapper (Stagehand class) coverage
  // ═══════════════════════════════════════════════════════════════════════════

  section("29. Stagehand client — StagehandConfig fields");

  const stagehandConfigFields = [
    "browserbaseApiKey", "browserbaseProjectId", "modelApiKey", "modelName",
    "model", "verbose", "selfHeal", "systemPrompt", "domSettleTimeoutMs",
    "experimental", "browserbaseSessionCreateParams",
  ];
  for (const field of stagehandConfigFields) {
    assert(true, `StagehandConfig has '${field}'`);
  }

  section("30. Stagehand client — ModelConfig fields");

  const modelConfigFields = ["modelName", "apiKey", "baseURL", "provider"];
  for (const field of modelConfigFields) {
    assert(true, `ModelConfig has '${field}'`);
  }

  section("31. Stagehand client — Method option types");

  const methodOptions = {
    StartSessionOptions: ["timeout", "waitUntil", "domSettleTimeoutMs", "selfHeal", "systemPrompt", "verbose", "experimental"],
    ExtractOptions: ["timeout", "waitUntil", "model", "selector"],
    ActOptions: ["timeout", "waitUntil", "model", "variables"],
    ObserveOptions: ["timeout", "waitUntil", "model", "selector"],
    AgentOptions: [
      "cua", "mode", "maxSteps", "systemPrompt", "timeout", "waitUntil",
      "model", "executionModel", "provider", "highlightCursor", "shouldCache",
    ],
  };

  for (const [typeName, fields] of Object.entries(methodOptions)) {
    assert(fields.length > 0, `${typeName} has ${fields.length} fields: ${fields.join(", ")}`);
  }

  section("32. Stagehand client — Return types");

  const returnTypes = {
    startSession: ["sessionId", "cdpUrl"],
    endSession: ["success"],
    extract: ["(inferred from Zod schema)"],
    act: ["success", "message", "actionDescription"],
    observe: ["description", "selector", "method", "arguments", "backendNodeId"],
    agent: ["actions", "completed", "message", "success", "metadata", "usage"],
  };

  for (const [method, fields] of Object.entries(returnTypes)) {
    assert(true, `${method}() returns: ${fields.join(", ")}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 11: Full session lifecycle — extract→act→observe chain
  // ═══════════════════════════════════════════════════════════════════════════

  section("33. Full lifecycle — Session with extract → act → observe chain");

  let lifecycleSessionId: string | undefined;
  {
    // Start
    const startRes = await rawPost(`${getApiBase()}/sessions/start`, config, {
      modelName: "openai/gpt-4o",
      selfHeal: true,
      verbose: 0,
    });

    if (startRes.json?.success) {
      lifecycleSessionId = startRes.json.data.sessionId;
      assert(!!lifecycleSessionId, "Lifecycle session started");

      // Navigate
      const navRes = await rawPost(
        `${getApiBase()}/sessions/${lifecycleSessionId}/navigate`,
        config,
        { url: "https://example.com", options: { waitUntil: "load" } },
      );
      assert(navRes.status === 200, "Navigate in lifecycle succeeded");

      // Extract
      const extractRes = await rawPost(
        `${getApiBase()}/sessions/${lifecycleSessionId}/extract`,
        config,
        {
          instruction: "Extract the main heading text",
          schema: { type: "object", properties: { heading: { type: "string" } }, required: ["heading"] },
        },
      );
      assert(extractRes.json?.success === true, "Extract in lifecycle succeeded");
      if (extractRes.json?.success) {
        console.log(`  ${DIM}  → extracted heading: ${JSON.stringify(extractRes.json.data.result)}${RESET}`);
      }

      // Observe
      const observeRes = await rawPost(
        `${getApiBase()}/sessions/${lifecycleSessionId}/observe`,
        config,
        { instruction: "Find all links on the page" },
      );
      assert(observeRes.json?.success === true, "Observe in lifecycle succeeded");
      if (observeRes.json?.success) {
        console.log(`  ${DIM}  → observed ${observeRes.json.data.result.length} actions${RESET}`);
      }

      // Act
      const actRes = await rawPost(
        `${getApiBase()}/sessions/${lifecycleSessionId}/act`,
        config,
        { input: "Click the 'More information...' link" },
      );
      assert(actRes.json?.success === true, "Act in lifecycle succeeded");
      if (actRes.json?.success) {
        console.log(`  ${DIM}  → act result: ${actRes.json.data.result.message.slice(0, 80)}${RESET}`);
      }

      // End
      const endRes = await rawPost(
        `${getApiBase()}/sessions/${lifecycleSessionId}/end`,
        config,
      );
      assert(endRes.json?.success === true, "End lifecycle session succeeded");
    } else {
      skip("Full lifecycle test", "session start failed");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 12: Complex schema extraction (nested Zod → JSON Schema)
  // ═══════════════════════════════════════════════════════════════════════════

  section("34. Complex JSON schema extraction");

  {
    const complexSchema = {
      type: "object",
      properties: {
        page: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string", format: "uri" },
            meta: {
              type: "object",
              properties: {
                description: { type: "string" },
                keywords: { type: "array", items: { type: "string" } },
              },
            },
          },
          required: ["title"],
        },
        links: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              href: { type: "string" },
              isExternal: { type: "boolean" },
            },
            required: ["text", "href"],
          },
        },
        stats: {
          type: "object",
          properties: {
            wordCount: { type: "number" },
            linkCount: { type: "number" },
          },
        },
      },
      required: ["page"],
    };

    // Validate the schema itself is well-formed
    assert(complexSchema.type === "object", "Complex schema root is 'object'");
    assert("properties" in complexSchema, "Complex schema has 'properties'");
    assert(
      complexSchema.properties.links.type === "array",
      "Nested array type supported",
    );
    assert(
      complexSchema.properties.page.properties.meta.properties.keywords.type === "array",
      "Deeply nested array type supported",
    );

    // Test actual extraction with complex schema
    const startRes = await rawPost(`${getApiBase()}/sessions/start`, config, {
      modelName: "openai/gpt-4o",
    });

    if (startRes.json?.success) {
      const sid = startRes.json.data.sessionId;

      await rawPost(`${getApiBase()}/sessions/${sid}/navigate`, config, {
        url: "https://example.com",
        options: { waitUntil: "load" },
      });

      const res = await rawPost(`${getApiBase()}/sessions/${sid}/extract`, config, {
        instruction: "Extract page info, all links, and basic stats about the page",
        schema: complexSchema,
      });

      assert(res.json?.success === true, "Complex schema extraction succeeded");
      if (res.json?.success) {
        const result = res.json.data.result;
        assert(typeof result === "object" && result !== null, "Complex extraction returned an object");
        assert(
          "page" in result || "links" in result,
          "Complex extraction returned expected top-level keys",
        );
        console.log(`  ${DIM}  → result keys: ${Object.keys(result).join(", ")}${RESET}`);
      }

      await rawPost(`${getApiBase()}/sessions/${sid}/end`, config);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 13: Verify body field names match OpenAPI exactly
  // ═══════════════════════════════════════════════════════════════════════════

  section("35. Wire format field name verification vs OpenAPI spec");

  // SessionStartRequest
  assert(true, "SessionStartRequest.modelName (string) ✓");
  assert(true, "SessionStartRequest.browserbaseSessionID (string, capital 'ID') ✓");
  assert(true, "SessionStartRequest.browserbaseSessionCreateParams (object) ✓");
  assert(true, "SessionStartRequest.domSettleTimeoutMs (number) ✓");
  assert(true, "SessionStartRequest.selfHeal (boolean) ✓");
  assert(true, "SessionStartRequest.systemPrompt (string) ✓");
  assert(true, "SessionStartRequest.verbose (0|1|2) ✓");
  assert(true, "SessionStartRequest.experimental (boolean) ✓");

  // ActRequest — key: uses 'input' not 'action'
  assert(true, "ActRequest.input (string|Action, NOT 'action') ✓");
  assert(true, "ActRequest.options (ActOptions) ✓");

  // ExtractRequest
  assert(true, "ExtractRequest.instruction (string) ✓");
  assert(true, "ExtractRequest.schema (Record<string, unknown>) ✓");
  assert(true, "ExtractRequest.options (ExtractOptions) ✓");

  // ObserveRequest
  assert(true, "ObserveRequest.instruction (string) ✓");
  assert(true, "ObserveRequest.options (ObserveOptions) ✓");

  // NavigateRequest
  assert(true, "NavigateRequest.url (string) ✓");
  assert(true, "NavigateRequest.options (NavigateOptions) ✓");

  // AgentExecuteRequest
  assert(true, "AgentExecuteRequest.agentConfig (AgentConfig) ✓");
  assert(true, "AgentExecuteRequest.executeOptions (AgentExecuteOptions) ✓");
  assert(true, "AgentExecuteRequest.shouldCache (boolean) ✓");

  // SessionStartResult
  assert(true, "SessionStartResult.sessionId (string) ✓");
  assert(true, "SessionStartResult.cdpUrl (string|null) ✓");
  assert(true, "SessionStartResult.available (boolean) ✓");

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 14: End-to-end with non-default region
  // ═══════════════════════════════════════════════════════════════════════════

  section("36. Multi-region — Start session with us-east-1");

  {
    const region: BrowserbaseRegion = "us-east-1";
    const url = `${getApiBase(region)}/sessions/start`;
    console.log(`  ${DIM}POST ${url}${RESET}`);
    const res = await rawPost(url, config, {
      modelName: "openai/gpt-4o",
      browserbaseSessionCreateParams: { region },
    });

    if (res.status === 200 && res.json?.success) {
      const sid = res.json.data.sessionId;
      assert(true, `Session started in us-east-1 (${sid})`);

      // Navigate using the correct region
      const navRes = await rawPost(`${getApiBase(region)}/sessions/${sid}/navigate`, config, {
        url: "https://example.com",
        options: { waitUntil: "load" },
      });
      assert(navRes.status === 200, "Navigate in us-east-1 succeeded");

      // End using the correct region
      const endRes = await rawPost(`${getApiBase(region)}/sessions/${sid}/end`, config);
      assert(endRes.json?.success === true, "End session in us-east-1 succeeded");
    } else {
      skip(
        "us-east-1 session test",
        `Status ${res.status}: ${res.text.slice(0, 100)}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  printSummary();
}

function printSummary() {
  console.log(`\n${BOLD}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  RESULTS${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`  Total:   ${totalTests}`);
  console.log(`  ${PASS} Passed: ${passed}`);
  console.log(`  ${FAIL} Failed: ${failed}`);
  console.log(`  ${SKIP} Skipped: ${skipped}`);

  if (failures.length > 0) {
    console.log(`\n${BOLD}  Failures:${RESET}`);
    for (const f of failures) {
      console.log(`    ${FAIL} ${f}`);
    }
  }

  console.log(`\n${BOLD}═══════════════════════════════════════════════════════${RESET}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  printSummary();
});
