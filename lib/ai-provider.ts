export type AiProvider = "deepseek" | "claude";
export type AiApiMode = "anthropic" | "openai-compatible";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiConnection = {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  apiMode?: AiApiMode;
  model?: string;
};

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function isAiProvider(value: unknown): value is AiProvider {
  return value === "deepseek" || value === "claude";
}

export function aiProviderLabel(provider: AiProvider) {
  return provider === "claude" ? "Claude" : "DeepSeek";
}

export function resolveAiConnection(request: Request): AiConnection | null {
  const requestedProvider = request.headers.get("x-ai-provider")?.trim().toLowerCase();
  if (requestedProvider && !isAiProvider(requestedProvider)) {
    throw new AiProviderError(`Unsupported AI provider: ${requestedProvider}.`);
  }

  const legacyDeepSeekKey = request.headers.get("x-deepseek-api-key")?.trim();
  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configuredProvider && !isAiProvider(configuredProvider)) {
    throw new AiProviderError(`AI_PROVIDER must be deepseek or claude.`);
  }

  const provider: AiProvider = requestedProvider as AiProvider | undefined
    ?? (legacyDeepSeekKey ? "deepseek" : undefined)
    ?? configuredProvider as AiProvider | undefined
    ?? (process.env.DEEPSEEK_API_KEY ? "deepseek" : process.env.ANTHROPIC_API_KEY ? "claude" : "deepseek");
  const browserKey = request.headers.get("x-ai-api-key")?.trim();
  const apiKey = browserKey
    ?? (provider === "deepseek" ? legacyDeepSeekKey || process.env.DEEPSEEK_API_KEY : process.env.ANTHROPIC_API_KEY);
  if (!apiKey) return null;

  const browserBaseUrl = request.headers.get("x-ai-base-url")?.trim();
  const browserApiMode = request.headers.get("x-ai-api-mode")?.trim().toLowerCase();
  const browserModel = request.headers.get("x-ai-model")?.trim();
  if (browserApiMode && browserApiMode !== "anthropic" && browserApiMode !== "openai-compatible") {
    throw new AiProviderError("X-AI-API-Mode must be anthropic or openai-compatible.");
  }
  const baseUrl = browserBaseUrl ? validateProviderBaseUrl(browserBaseUrl) : undefined;
  if (browserModel && (browserModel.length > 200 || /[\r\n]/.test(browserModel))) {
    throw new AiProviderError("The AI model name is invalid.");
  }
  return {
    provider,
    apiKey,
    ...(provider === "claude" && baseUrl ? { baseUrl } : {}),
    ...(provider === "claude" && baseUrl && browserApiMode ? { apiMode: browserApiMode as AiApiMode } : {}),
    ...(provider === "claude" && browserModel ? { model: browserModel } : {})
  };
}

function validateProviderBaseUrl(value: string) {
  if (value.length > 500) throw new AiProviderError("The AI API address is too long.");
  let url: URL;
  try { url = new URL(value); } catch { throw new AiProviderError("The AI API address must be a valid URL."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AiProviderError("The AI API address must use HTTP or HTTPS.");
  if (url.username || url.password) throw new AiProviderError("The AI API address cannot contain credentials.");
  return url.toString().replace(/\/$/, "");
}

export async function requestAiText(options: {
  provider: AiProvider;
  apiKey: string;
  messages: AiChatMessage[];
  temperature: number;
  maxTokens: number;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  apiMode?: AiApiMode;
}): Promise<string> {
  return options.provider === "claude" ? requestClaudeText(options) : requestDeepSeekText(options);
}

async function requestDeepSeekText(options: Parameters<typeof requestAiText>[0]) {
  const baseUrl = (options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  return requestOpenAiCompatibleText(options, { baseUrl, model, providerName: "DeepSeek", requestJsonObject: true });
}

async function requestOpenAiCompatibleText(
  options: Parameters<typeof requestAiText>[0],
  config: { baseUrl: string; model: string; providerName: string; requestJsonObject: boolean }
) {
  const request = options.fetch ?? fetch;
  const response = await request(apiEndpoint(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      ...(config.requestJsonObject ? { response_format: { type: "json_object" } } : {}),
      messages: options.messages
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new AiProviderError(`${config.providerName} request failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  const data = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new AiProviderError(`${config.providerName} truncated the response.`);
  const content = choice?.message?.content;
  if (!content) throw new AiProviderError(`${config.providerName} returned an empty response.`);
  return content;
}

async function requestClaudeText(options: Parameters<typeof requestAiText>[0]) {
  const baseUrl = (options.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
  const apiMode = options.apiMode ?? process.env.ANTHROPIC_API_MODE ?? "anthropic";
  if (apiMode !== "anthropic" && apiMode !== "openai-compatible") {
    throw new AiProviderError("ANTHROPIC_API_MODE must be anthropic or openai-compatible.");
  }
  if (apiMode === "openai-compatible") {
    return requestOpenAiCompatibleText(options, { baseUrl, model, providerName: "Claude", requestJsonObject: false });
  }
  const request = options.fetch ?? fetch;
  const system = options.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const messages = mergeClaudeMessages(options.messages.filter(
    (message): message is AiChatMessage & { role: "user" | "assistant" } => message.role !== "system"
  ));
  const response = await request(apiEndpoint(baseUrl, "/v1/messages"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      ...(system ? { system } : {}),
      messages
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new AiProviderError(`Claude request failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  const data = await response.json() as { stop_reason?: string; content?: Array<{ type?: string; text?: string }> };
  if (data.stop_reason === "max_tokens") throw new AiProviderError("Claude truncated the response.");
  const content = data.content?.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n").trim();
  if (!content) throw new AiProviderError("Claude returned an empty response.");
  return content;
}

function apiEndpoint(baseUrl: string, path: string) {
  if (baseUrl.endsWith(path)) return baseUrl;
  if (baseUrl.endsWith("/v1") && path.startsWith("/v1/")) return `${baseUrl}${path.slice(3)}`;
  return `${baseUrl}${path}`;
}

function mergeClaudeMessages(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const merged: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (previous?.role === message.role) previous.content += `\n\n${message.content}`;
    else merged.push({ ...message });
  }
  return merged;
}

export function parseAiJson(content: string): unknown {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? normalized.slice(start, end + 1) : normalized) as unknown;
}
