import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILD_SCRIPT_SYSTEM_PROMPT,
  createDeepSeekBuildScriptChat,
  DeepSeekBuildScriptError,
  DeepSeekBuildScriptResponseError,
  generateWithDeepSeekBuildScript
} from "../lib/deepseek-build-script-planner";
import type { DeepSeekBuildScriptChat } from "../lib/deepseek-build-script-planner";
import { MINECRAFT_BLOCK_IDS } from "../lib/minecraft-block-registry-1.20.1";

function validScript(name = "provider-cottage") {
  return {
    version: 1,
    name,
    bounds: { width: 64, depth: 64, maxHeight: 64 },
    palette: {
      base: "minecraft:stone_bricks",
      wall: "minecraft:oak_planks",
      roof: "minecraft:spruce_planks"
    },
    operations: [
      { type: "foundation", id: "base", origin: [18, 0, 18], size: [20, 1, 18], material: "base" },
      { type: "hollowBox", id: "house", origin: [20, 1, 20], size: [16, 8, 14], wall: "wall", floor: "base" },
      { type: "flatRoof", id: "roof", target: "house", overhang: 1, thickness: 1, material: "roof" },
      { type: "entrance", id: "door", target: "house", side: "front", width: 2, height: 3 }
    ]
  };
}

test("the generation prompt receives the complete Java 1.20.1 block registry", () => {
  assert.match(BUILD_SCRIPT_SYSTEM_PROMPT, new RegExp(`Available material IDs \\(${MINECRAFT_BLOCK_IDS.length} total\\)`));
  for (const id of MINECRAFT_BLOCK_IDS) assert.ok(BUILD_SCRIPT_SYSTEM_PROMPT.includes(id), id);
  assert.match(BUILD_SCRIPT_SYSTEM_PROMPT, /there is no required minimum or maximum palette size/);
});

test("a valid first DeepSeek BuildScript compiles without a repair call", async () => {
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return { buildScript: validScript() };
  };
  const result = await generateWithDeepSeekBuildScript("a cottage", "test-key", { chat });
  assert.equal(calls, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.repaired, false);
  assert.deepEqual(result.script.bounds, { width: 128, depth: 128, maxHeight: 128 });
  assert.equal(result.validation.valid, true);
  assert.equal(result.stats.operationCount, 4);
  assert.ok(result.structure.blocks.length > 100);
});

test("a hollow volume without an entrance is accepted when the model chooses it", async () => {
  const doorless = validScript("doorless-volume");
  doorless.operations = doorless.operations.filter((operation) => operation.type !== "entrance");
  const requests: Parameters<DeepSeekBuildScriptChat>[0][] = [];
  const chat: DeepSeekBuildScriptChat = async (request) => {
    requests.push(request);
    return doorless;
  };
  const result = await generateWithDeepSeekBuildScript("a robot torso", "test-key", { chat });
  assert.equal(requests.length, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.repaired, false);
  assert.equal(result.script.name, "doorless-volume");
  assert.equal(requests[0].maxTokens, 8192);
  assert.doesNotMatch(requests[0].messages[0].content, /Every hollowBox must have an entrance/);
  assert.match(requests[0].messages[0].content, /does not imply a house/);
  assert.match(requests[0].messages[0].content, /Keep the JSON compact/);
});

test("unlimited mode removes the 100,000-block generation budget", async () => {
  const large = validScript("large-foundation");
  large.operations = [
    { type: "foundation", id: "large-base", origin: [0, 0, 0], size: [128, 7, 128], material: "base" }
  ];
  const requests: Parameters<DeepSeekBuildScriptChat>[0][] = [];
  const chat: DeepSeekBuildScriptChat = async (request) => {
    requests.push(request);
    return large;
  };
  const result = await generateWithDeepSeekBuildScript("fill a large scene", "test-key", { chat, unlimitedBlocks: true });
  assert.equal(result.structure.blocks.length, 114_688);
  assert.match(requests[0].messages[0].content, /2,097,152 occupied blocks/);
  assert.doesNotMatch(requests[0].messages[0].content, /stay comfortably below 100,000 blocks/);
});

test("schema and material failures are sent through the same bounded repair path", async () => {
  const invalid = validScript("invented-material");
  invalid.palette.wall = "mod:diamond_block";
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return calls === 1 ? invalid : validScript("material-repaired");
  };
  const result = await generateWithDeepSeekBuildScript("a diamond house", "test-key", { chat });
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  assert.equal(result.script.palette.wall, "minecraft:oak_planks");
});

test("fractional hollowBox dimensions are normalized without adding building semantics", async () => {
  const invalid = validScript("fractional-object");
  invalid.operations = invalid.operations.filter((operation) => operation.type !== "entrance");
  const box = invalid.operations.find((operation) => operation.type === "hollowBox")!;
  Object.assign(box, { size: [16, 1.5, 14] });
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("an abstract robot torso", "test-key", { chat });
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  const normalizedBox = result.script.operations.find((operation) => operation.type === "hollowBox");
  assert.equal(normalizedBox?.type === "hollowBox" ? normalizedBox.size[1] : undefined, 2);
  assert.equal(result.script.operations.some((operation) => operation.type === "entrance"), false);
});

test("out-of-range operation numbers are deterministically clamped after repair", async () => {
  const invalid = validScript("oversized-porch");
  const house = invalid.operations.find((operation) => operation.type === "hollowBox")!;
  Object.assign(house, { size: [40, 8, 14] });
  invalid.operations.push({
    type: "porch",
    id: "wide-porch",
    target: "house",
    side: "front",
    width: 19.6,
    depth: 2,
    material: "base",
  } as unknown as (typeof invalid.operations)[number]);
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("a cottage with a wide porch", "test-key", { chat });
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  const porch = result.script.operations.find((operation) => operation.id === "wide-porch");
  assert.equal(porch?.type === "porch" ? porch.width : undefined, 20);
});

test("the literal palette placeholder is removed after the bounded repair", async () => {
  const invalid = validScript("placeholder-palette");
  Object.assign(invalid.palette, { alias: "minecraft:block_id" });
  let calls = 0;
  let repairRequest = "";
  const chat: DeepSeekBuildScriptChat = async (request) => {
    calls += 1;
    if (calls === 2) repairRequest = request.messages[1].content;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("an original voxel object", "test-key", { chat });
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  assert.match(repairRequest, /Never output the literal placeholder/);
  assert.equal("alias" in result.script.palette, false);
});

test("an invented palette block is replaced after the bounded repair", async () => {
  const invalid = validScript("invented-roof-block");
  invalid.palette.roof = "minecraft:roof";
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("a cottage with a roof", "test-key", { chat });
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  assert.equal(result.script.palette.roof, "minecraft:stone_bricks");
});

test("entrance offset diagnostics tell the repair pass to recenter the opening", async () => {
  const invalid = validScript("bad-door-offset");
  const entrance = invalid.operations.find((operation) => operation.type === "entrance")!;
  Object.assign(entrance, { width: 4, offset: 16 });
  let calls = 0;
  let repairRequest = "";
  const chat: DeepSeekBuildScriptChat = async (request) => {
    calls += 1;
    if (calls === 1) return invalid;
    repairRequest = request.messages[1].content;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("an asymmetric cottage", "test-key", { chat });
  assert.equal(result.repaired, true);
  assert.equal(calls, 2);
  assert.match(repairRequest, /use an offset from -\d+ to \d+/);
  assert.match(repairRequest, /remove the offset field/);
  const repairedEntrance = result.script.operations.find((operation) => operation.type === "entrance");
  assert.equal(repairedEntrance?.type === "entrance" ? repairedEntrance.offset : undefined, 0);
});

test("entrance height diagnostics clamp the opening below the top wall", async () => {
  const invalid = validScript("bad-door-height");
  const house = invalid.operations.find((operation) => operation.type === "hollowBox")!;
  const entrance = invalid.operations.find((operation) => operation.type === "entrance")!;
  Object.assign(house, { size: [16, 5, 14] });
  Object.assign(entrance, { height: 5 });
  let calls = 0;
  let repairRequest = "";
  const chat: DeepSeekBuildScriptChat = async (request) => {
    calls += 1;
    if (calls === 1) return invalid;
    repairRequest = request.messages[1].content;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("a low cottage", "test-key", { chat });
  assert.equal(result.repaired, true);
  assert.equal(calls, 2);
  assert.match(repairRequest, /size\[1\] minus 2/);
  const repairedEntrance = result.script.operations.find((operation) => operation.type === "entrance");
  assert.equal(repairedEntrance?.type === "entrance" ? repairedEntrance.height : undefined, 3);
});

test("entrance height recovery raises a wall that is too short for the minimum door", async () => {
  const invalid = validScript("short-wall");
  const house = invalid.operations.find((operation) => operation.type === "hollowBox")!;
  const entrance = invalid.operations.find((operation) => operation.type === "entrance")!;
  Object.assign(house, { size: [16, 3, 14] });
  Object.assign(entrance, { height: 2 });
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("a very low cottage", "test-key", { chat });
  assert.equal(result.repaired, true);
  assert.equal(calls, 2);
  const repairedHouse = result.script.operations.find((operation) => operation.type === "hollowBox");
  const repairedEntrance = result.script.operations.find((operation) => operation.type === "entrance");
  assert.equal(repairedHouse?.type === "hollowBox" ? repairedHouse.size[1] : undefined, 4);
  assert.equal(repairedEntrance?.type === "entrance" ? repairedEntrance.height : undefined, 2);
});

test("a blocked model-authored entrance is advisory instead of rejecting the scene", async () => {
  const invalid = validScript("blocked-door");
  invalid.operations.splice(3, 0, {
    type: "cylinder",
    id: "door-blocker",
    origin: [27, 1, 19],
    radius: 1,
    height: 4,
    material: "base"
  } as unknown as (typeof invalid.operations)[number]);
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return invalid;
  };
  const result = await generateWithDeepSeekBuildScript("a cottage with a clear entry", "test-key", { chat });
  assert.equal(result.repaired, false);
  assert.equal(calls, 1);
  assert.equal(result.validation.valid, true);
  assert.ok(result.validation.diagnostics.some((diagnostic) => diagnostic.code === "BLOCKED_ENTRANCE" && diagnostic.severity === "warning"));
});

test("a second invalid candidate fails without a third provider call", async () => {
  const invalid = validScript("still-invalid");
  (invalid as unknown as { version: number }).version = 2;
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    return invalid;
  };
  await assert.rejects(
    () => generateWithDeepSeekBuildScript("a cottage", "test-key", { chat }),
    (error: unknown) => error instanceof DeepSeekBuildScriptError && error.attempts === 2 && error.diagnostics.some((diagnostic) => diagnostic.includes("version must be 1"))
  );
  assert.equal(calls, 2);
});

test("provider transport errors preserve the current document and are not mistaken for validation failures", async () => {
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    throw new Error("provider unavailable");
  };
  await assert.rejects(() => generateWithDeepSeekBuildScript("a cottage", "test-key", { chat }), /provider unavailable/);
  assert.equal(calls, 1);
});

test("malformed model output receives at most one clean regeneration attempt", async () => {
  let calls = 0;
  const chat: DeepSeekBuildScriptChat = async () => {
    calls += 1;
    if (calls === 1) throw new DeepSeekBuildScriptResponseError("malformed JSON");
    return validScript("json-repaired");
  };
  const result = await generateWithDeepSeekBuildScript("a cottage", "test-key", { chat });
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  assert.equal(result.script.name, "json-repaired");
});

test("the production chat adapter requests JSON and parses fenced provider content", async () => {
  let authorization = "";
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: `\`\`\`json\n${JSON.stringify(validScript("fenced"))}\n\`\`\`` } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const chat = createDeepSeekBuildScriptChat("secret-key", { baseUrl: "https://example.test/", model: "test-model", fetch: fakeFetch });
  const parsed = await chat({ messages: [{ role: "user", content: "build" }], temperature: 0, maxTokens: 1000 });
  assert.equal(authorization, "Bearer secret-key");
  assert.deepEqual(parsed, validScript("fenced"));
});
