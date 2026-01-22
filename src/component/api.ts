/**
 * Stagehand REST API Client
 *
 * Wraps the Stagehand API at https://api.stagehand.browserbase.com
 */

const API_BASE = "https://api.stagehand.browserbase.com/v1";

export interface ApiConfig {
  browserbaseApiKey: string;
  browserbaseProjectId: string;
  modelApiKey: string;
  modelName?: string;
}

export interface SessionData {
  sessionId: string;
  browserbaseSessionId?: string;
  cdpUrl?: string;
  available: boolean;
}

export interface StartSessionOptions {
  browserbaseSessionId?: string;
  domSettleTimeoutMs?: number;
  selfHeal?: boolean;
  systemPrompt?: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
}

function getHeaders(config: ApiConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-bb-api-key": config.browserbaseApiKey,
    "x-bb-project-id": config.browserbaseProjectId,
    "x-model-api-key": config.modelApiKey,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Stagehand API error (${response.status}): ${errorText}`,
    );
  }
  const json = (await response.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(`Stagehand API returned success: false`);
  }
  return json.data;
}

export async function startSession(
  config: ApiConfig,
  options?: StartSessionOptions,
): Promise<SessionData> {
  const response = await fetch(`${API_BASE}/sessions/start`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      modelName: config.modelName || "openai/gpt-4o",
      browserbaseSessionId: options?.browserbaseSessionId,
      domSettleTimeoutMs: options?.domSettleTimeoutMs,
      selfHeal: options?.selfHeal,
      systemPrompt: options?.systemPrompt,
    }),
  });
  return handleResponse<SessionData>(response);
}

export async function endSession(
  sessionId: string,
  config: ApiConfig,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
      method: "POST",
      headers: getHeaders(config),
    });
  } catch {
    // Ignore errors when ending session - best effort cleanup
  }
}

export interface NavigateOptions {
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeout?: number;
}

export async function navigate(
  sessionId: string,
  url: string,
  config: ApiConfig,
  options?: NavigateOptions,
): Promise<void> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/navigate`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      url,
      options: {
        waitUntil: options?.waitUntil || "networkidle",
        timeout: options?.timeout,
      },
    }),
  });
  await handleResponse(response);
}

export interface ExtractResult<T = any> {
  result: T;
  actionId: string;
}

export async function extract(
  sessionId: string,
  instruction: string,
  schema: any,
  config: ApiConfig,
): Promise<ExtractResult> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/extract`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      instruction,
      schema,
    }),
  });
  return handleResponse<ExtractResult>(response);
}

export interface ActResult {
  result: {
    actionDescription: string;
    actions: Array<{
      description: string;
      selector: string;
      arguments?: string[];
      method: string;
    }>;
    message: string;
    success: boolean;
  };
  actionId: string;
}

export async function act(
  sessionId: string,
  action: string,
  config: ApiConfig,
): Promise<ActResult> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/act`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      input: action,
    }),
  });
  return handleResponse<ActResult>(response);
}

export interface ObserveResult {
  result: Array<{
    description: string;
    selector: string;
    arguments?: string[];
    backendNodeId?: number;
    method: string;
  }>;
  actionId: string;
}

export async function observe(
  sessionId: string,
  instruction: string,
  config: ApiConfig,
): Promise<ObserveResult> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/observe`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      instruction,
    }),
  });
  return handleResponse<ObserveResult>(response);
}

export interface AgentConfig {
  cua?: boolean;
  model?: string;
  systemPrompt?: string;
}

export interface AgentExecuteOptions {
  instruction: string;
  maxSteps?: number;
}

export interface AgentAction {
  type: string;
  action?: string;
  reasoning?: string;
  timeMs?: number;
}

export interface AgentExecuteResult {
  result: {
    actions: AgentAction[];
    completed: boolean;
    message: string;
    success: boolean;
  };
}

export async function agentExecute(
  sessionId: string,
  agentConfig: AgentConfig,
  executeOptions: AgentExecuteOptions,
  config: ApiConfig,
): Promise<AgentExecuteResult> {
  const response = await fetch(
    `${API_BASE}/sessions/${sessionId}/agent/execute`,
    {
      method: "POST",
      headers: getHeaders(config),
      body: JSON.stringify({
        agentConfig: {
          cua: agentConfig.cua,
          model: agentConfig.model,
          systemPrompt: agentConfig.systemPrompt,
        },
        instruction: executeOptions.instruction,
        maxSteps: executeOptions.maxSteps,
      }),
    },
  );
  return handleResponse<AgentExecuteResult>(response);
}
