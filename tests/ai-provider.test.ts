import assert from "node:assert/strict";
import test from "node:test";
import { parseAiJson, requestAiText, resolveAiConnection } from "../lib/ai-provider";

test("Claude transport uses the native Messages API and extracts text blocks", async () => {
  let url = "";
  let headers = new Headers();
  let body: Record<string, unknown> = {};
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input);
    headers = new Headers(init?.headers);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "```json\n{\"ok\":true}\n```" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const content = await requestAiText({
    provider: "claude",
    apiKey: "claude-secret",
    model: "claude-test",
    baseUrl: "https://anthropic.example/v1",
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: "Build a tower." }
    ],
    temperature: 0.2,
    maxTokens: 1200,
    fetch: fakeFetch
  });

  assert.equal(url, "https://anthropic.example/v1/messages");
  assert.equal(headers.get("x-api-key"), "claude-secret");
  assert.equal(headers.get("anthropic-version"), "2023-06-01");
  assert.equal(body.model, "claude-test");
  assert.equal(body.system, "Return JSON only.");
  assert.deepEqual(body.messages, [{ role: "user", content: "Build a tower." }]);
  assert.deepEqual(parseAiJson(content), { ok: true });
});

test("AI connection headers select Claude while legacy DeepSeek headers remain supported", () => {
  const claude = resolveAiConnection(new Request("https://example.test", {
    headers: { "X-AI-Provider": "claude", "X-AI-API-Key": "claude-key" }
  }));
  assert.deepEqual(claude, { provider: "claude", apiKey: "claude-key" });

  const deepseek = resolveAiConnection(new Request("https://example.test", {
    headers: { "X-DeepSeek-API-Key": "legacy-key" }
  }));
  assert.deepEqual(deepseek, { provider: "deepseek", apiKey: "legacy-key" });

  const relay = resolveAiConnection(new Request("https://example.test", {
    headers: {
      "X-AI-Provider": "claude",
      "X-AI-API-Key": "relay-key",
      "X-AI-Base-URL": "https://relay.example/v1/",
      "X-AI-API-Mode": "openai-compatible",
      "X-AI-Model": "claude-opus-4-8"
    }
  }));
  assert.deepEqual(relay, {
    provider: "claude",
    apiKey: "relay-key",
    baseUrl: "https://relay.example/v1",
    apiMode: "openai-compatible",
    model: "claude-opus-4-8"
  });
  assert.throws(() => resolveAiConnection(new Request("https://example.test", {
    headers: { "X-AI-Provider": "claude", "X-AI-API-Key": "key", "X-AI-Base-URL": "file:///etc/passwd" }
  })), /HTTP or HTTPS/);
});

test("Claude relays can use an OpenAI-compatible chat completions endpoint", async () => {
  let url = "";
  let headers = new Headers();
  let body: Record<string, unknown> = {};
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input);
    headers = new Headers(init?.headers);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"relay\":true}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const content = await requestAiText({
    provider: "claude",
    apiKey: "relay-key",
    model: "claude-relay-model",
    baseUrl: "https://relay.example/v1",
    apiMode: "openai-compatible",
    messages: [{ role: "user", content: "Return JSON." }],
    temperature: 0,
    maxTokens: 500,
    fetch: fakeFetch
  });

  assert.equal(url, "https://relay.example/v1/chat/completions");
  assert.equal(headers.get("authorization"), "Bearer relay-key");
  assert.equal(body.model, "claude-relay-model");
  assert.equal("response_format" in body, false);
  assert.deepEqual(parseAiJson(content), { relay: true });
});
