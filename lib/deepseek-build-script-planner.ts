import { compileBuildScript } from "./build-script-compiler";
import { BLOCK_IDS, MAX_SCENE_BLOCKS, MAX_VISITED_COORDINATES, SCENE_MAX_COORDINATE, SCENE_SIZE, isBlockId } from "./structure";
import type { BuildScript, BuildScriptBudgets } from "./build-script";
import type { BuildScriptCompilation } from "./build-script-compiler";
import { aiProviderLabel, parseAiJson, requestAiText } from "./ai-provider";
import type { AiApiMode, AiProvider } from "./ai-provider";

type ChatMessage = { role: "system" | "user"; content: string };

export type DeepSeekBuildScriptChat = (request: {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}) => Promise<unknown>;

export type DeepSeekBuildScriptResult = BuildScriptCompilation & {
  summary: string;
  attempts: 1 | 2;
  repaired: boolean;
};

const BUILD_SCRIPT_MAX_TOKENS = 8192;
const UNLIMITED_BLOCK_BUDGETS: Partial<BuildScriptBudgets> = {
  maxChangedBlocks: MAX_SCENE_BLOCKS,
  maxCoordinates: Math.max(MAX_VISITED_COORDINATES, MAX_SCENE_BLOCKS * 4)
};

export class DeepSeekBuildScriptError extends Error {
  readonly attempts: number;
  readonly diagnostics: string[];

  constructor(message: string, attempts: number, diagnostics: string[]) {
    super(message);
    this.name = "DeepSeekBuildScriptError";
    this.attempts = attempts;
    this.diagnostics = [...diagnostics];
  }
}

export class DeepSeekBuildScriptResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekBuildScriptResponseError";
  }
}

const EXAMPLE_MEDIEVAL = {
  version: 1,
  name: "medieval-cottage",
  bounds: { width: 128, depth: 128, maxHeight: 128 },
  palette: {
    base: "minecraft:cobblestone",
    wall: "minecraft:oak_planks",
    roof: "minecraft:spruce_planks",
    glass: "minecraft:glass_pane",
    path: "minecraft:stone_bricks"
  },
  operations: [
    { type: "foundation", id: "base", origin: [18, 0, 19], size: [20, 1, 18], material: "base" },
    { type: "hollowBox", id: "main-house", origin: [20, 1, 21], size: [16, 8, 14], wall: "wall", floor: "base" },
    { type: "gableRoof", id: "main-roof", target: "main-house", height: 5, overhang: 1, material: "roof", ridgeAxis: "x" },
    { type: "entrance", id: "front-door", target: "main-house", side: "front", width: 2, height: 3 },
    { type: "windows", id: "windows", target: "main-house", side: "all", count: 2, material: "glass" },
    { type: "porch", id: "porch", target: "main-house", side: "front", width: 6, depth: 2, material: "base" },
    { type: "path", id: "path", target: "front-door", length: 8, width: 3, material: "path" }
  ]
};

const EXAMPLE_MODERN = {
  version: 1,
  name: "modern-villa",
  bounds: { width: 128, depth: 128, maxHeight: 128 },
  palette: {
    base: "minecraft:stone_bricks",
    wall: "minecraft:gray_concrete",
    roof: "minecraft:iron_block",
    glass: "minecraft:glass_pane"
  },
  operations: [
    { type: "foundation", id: "base", origin: [16, 0, 18], size: [26, 1, 20], material: "base" },
    { type: "hollowBox", id: "villa", origin: [19, 1, 21], size: [20, 7, 14], wall: "wall", floor: "base" },
    { type: "flatRoof", id: "roof", target: "villa", overhang: 1, thickness: 1, material: "roof" },
    { type: "entrance", id: "entry", target: "villa", side: "front", width: 3, height: 3, offset: 4 },
    { type: "windows", id: "glass-band", target: "villa", side: "all", count: 3, width: 2, height: 2, sillHeight: 2, material: "glass" }
  ]
};

const EXAMPLE_DESERT = {
  version: 1,
  name: "desert-watchtower",
  bounds: { width: 128, depth: 128, maxHeight: 128 },
  palette: {
    base: "minecraft:red_sandstone",
    wall: "minecraft:sandstone",
    accent: "minecraft:red_sandstone",
    glass: "minecraft:glass_pane"
  },
  operations: [
    { type: "foundation", id: "base", origin: [20, 0, 20], size: [18, 1, 18], material: "base" },
    { type: "hollowBox", id: "tower", origin: [23, 1, 23], size: [12, 13, 12], wall: "wall", floor: "base" },
    { type: "flatRoof", id: "roof", target: "tower", overhang: 1, thickness: 2, material: "accent" },
    { type: "entrance", id: "door", target: "tower", side: "front", width: 2, height: 3 },
    { type: "windows", id: "windows", target: "tower", side: "all", count: 2, width: 1, height: 2, sillHeight: 5, material: "glass" }
  ]
};

export const BUILD_SCRIPT_SYSTEM_PROMPT = `You are the voxel scene planner for VibeCraft Studio. Interpret the user's subject and composition directly. Return one complete BuildScript v1 JSON object and nothing else.

BuildScript root:
{"version":1,"name":"slug","bounds":{"width":128,"depth":128,"maxHeight":128},"palette":{"primary":"minecraft:stone_bricks"},"operations":[...]}

Operations, in dependency order:
- foundation: {"type":"foundation","id","origin":[x,y,z],"size":[width,height,depth],"material"}. Every origin and size value must be an integer; size values are at least 1.
- hollowBox: {"type":"hollowBox","id","origin":[x,y,z],"size":[width,height,depth],"wall","floor"?}. Every origin and size value must be an integer; size is at least [3,2,3].
- cylinder: {"type":"cylinder","id","origin":[centerX,bottomY,centerZ],"radius":1..32,"height":1..128,"material","hollow"?}
- gableRoof: {"type":"gableRoof","id","target":"earlier hollowBox id","height":1..64,"overhang":0..16,"material","ridgeAxis":"x|z"?}
- flatRoof: {"type":"flatRoof","id","target":"earlier hollowBox id","overhang":0..16,"thickness":1..8,"material"}
- entrance: {"type":"entrance","id","target":"earlier hollowBox id","side":"front|back|left|right","width":1..8,"height":2..10,"offset"?}. The target hollowBox must be at least 4 blocks high. Entrance height must also be at most the target hollowBox size[1] minus 2, leaving a wall block above. Omit offset for a centered entrance unless the user explicitly requests an asymmetric entrance.
- windows: {"type":"windows","id","target":"earlier hollowBox id","side":"front|back|left|right|all","count":1..24,"width":1..6,"height":1..6,"sillHeight":1..64,"material"}
- porch: {"type":"porch","id","target":"earlier hollowBox id","side":"front|back|left|right","width":1..32,"depth":1..16,"material"}
- path: {"type":"path","id","target":"earlier entrance id","length":2..48,"width":1..10,"material"}
- copyMirror: {"type":"copyMirror","id","target":"earlier component id","mode":"copy","offset":[dx,dy,dz]} or {"type":"copyMirror","id","target","mode":"mirror","axis":"x|z","pivot":0..127}

Rules:
1. Use exactly 128x128x128 bounds. Materials must be real Minecraft Java 1.20.1 block IDs in the form minecraft:block_name. The complete supported occupied-block registry is listed below. Choose freely from it according to the user's request; the list is not a recommendation or ranking, and there is no required minimum or maximum palette size.
Available material IDs (${BLOCK_IDS.length} total): ${BLOCK_IDS.join(", ")}.
2. Keep all geometry, including roof overhangs, porches, paths, copies, and mirrors, inside x/z 0..127 and y 0..127. Center the main composition near x/z 64.
3. Decide the subject, silhouette, grounding, symmetry, and operation mix from the user's request. A hollowBox is just a hollow rectangular volume; it does not imply a house.
4. Entrances, windows, porches, paths, and roofs are optional. Use them only when they belong to the requested subject. Do not add a door to a robot, fountain, statue, vehicle, tree, or other non-building unless the user asks for one.
5. Add referenced operations after their targets. Use enough operations for a recognizable silhouette and stay comfortably below 100,000 blocks. Keep the JSON compact and prefer fewer than 40 operations by using larger primitives, copyMirror, and repeated features instead of enumerating small parts.
6. Preserve intentional floating or separated parts when the subject calls for them. Express the request through geometry and proportions, not by forcing it into a building template.`;

const UNLIMITED_BLOCK_SYSTEM_PROMPT = BUILD_SCRIPT_SYSTEM_PROMPT.replace(
  "stay comfortably below 100,000 blocks",
  `you may use the full ${SCENE_SIZE}x${SCENE_SIZE}x${SCENE_SIZE} scene, up to ${MAX_SCENE_BLOCKS.toLocaleString("en-US")} occupied blocks`
);

function candidateFromResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return record.buildScript ?? record.script ?? value;
}

function failureDiagnostics(error: unknown): string[] {
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues?: unknown }).issues)) {
    return (error as { issues: string[] }).issues.slice(0, 12);
  }
  return [error instanceof Error ? error.message : "Unknown BuildScript validation failure."];
}

function evaluateCandidate(value: unknown, budgetOverrides: Partial<BuildScriptBudgets> = {}): { compilation?: BuildScriptCompilation; diagnostics: string[] } {
  try {
    const compilation = compileBuildScript(candidateFromResponse(value), budgetOverrides);
    const diagnostics = compilation.validation.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);
    return diagnostics.length ? { diagnostics } : { compilation, diagnostics: [] };
  } catch (error) {
    return { diagnostics: failureDiagnostics(error) };
  }
}

function repairPrompt(userPrompt: string, candidate: unknown, diagnostics: string[]) {
  return JSON.stringify({
    task: "Return one complete corrected BuildScript v1 JSON object. Do not return a patch, explanation, or markdown.",
    userPrompt,
    failedCandidate: candidate,
    diagnostics,
    mandatoryRepairRules: [
      "Every palette value must be a lowercase vanilla block ID in the form minecraft:block_name. Never output the literal placeholder minecraft:block_id or a mod namespace.",
      "Every origin and size coordinate must be an integer. Round fractional values; hollowBox size must be at least [3,2,3] and foundation size at least [1,1,1].",
      "For any entrance width/offset fit diagnostic, remove the offset field so the compiler centers the entrance; reduce width only if the centered entrance still cannot fit.",
      "For any entrance height diagnostic, make the target hollowBox at least 4 blocks high, then reduce entrance height to at most target size[1] minus 2 so at least one wall block remains above it.",
      "Keep every operation inside bounds, preserve dependency order, and return the entire script."
    ]
  });
}

function normalizeEntrances(value: unknown): unknown {
  const candidate = candidateFromResponse(value);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  const script = structuredClone(candidate) as Record<string, unknown>;
  if (!Array.isArray(script.operations)) return script;
  const boxes = new Map<string, { width: number; height: number; depth: number; operation: Record<string, unknown> }>();
  for (const item of script.operations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const operation = item as Record<string, unknown>;
    if (operation.type === "hollowBox" && typeof operation.id === "string" && Array.isArray(operation.size)) {
      const width = operation.size[0];
      const height = operation.size[1];
      const depth = operation.size[2];
      if (Number.isInteger(width) && Number.isInteger(height) && Number.isInteger(depth)) {
        boxes.set(operation.id, { width: width as number, height: height as number, depth: depth as number, operation });
      }
    }
    if (operation.type === "entrance" && typeof operation.target === "string") {
      const target = boxes.get(operation.target);
      if (!target) continue;
      const available = operation.side === "left" || operation.side === "right" ? target.depth - 2 : target.width - 2;
      if (available >= 1) operation.width = Math.min(typeof operation.width === "number" ? operation.width : 2, available, 8);
      if (target.height < 4 && Array.isArray(target.operation.size)) {
        const size = [...target.operation.size];
        size[1] = 4;
        target.operation.size = size;
        target.height = 4;
      }
      const maximumHeight = Math.min(target.height - 2, 10);
      if (maximumHeight >= 2) operation.height = Math.min(typeof operation.height === "number" ? operation.height : 3, maximumHeight);
      delete operation.offset;
    }
  }
  return script;
}

function normalizedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

function normalizeBoxCoordinates(value: unknown): unknown {
  const candidate = candidateFromResponse(value);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  const script = structuredClone(candidate) as Record<string, unknown>;
  if (!Array.isArray(script.operations)) return script;
  for (const item of script.operations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const operation = item as Record<string, unknown>;
    if ((operation.type !== "foundation" && operation.type !== "hollowBox") || !Array.isArray(operation.origin) || !Array.isArray(operation.size) || operation.origin.length !== 3 || operation.size.length !== 3) continue;
    const minimumSize = operation.type === "hollowBox" ? [3, 2, 3] : [1, 1, 1];
    const origin = operation.origin.map((coordinate, axis) => normalizedInteger(coordinate, 0, 0, SCENE_SIZE - minimumSize[axis]));
    const size = operation.size.map((dimension, axis) => normalizedInteger(dimension, minimumSize[axis], minimumSize[axis], SCENE_SIZE - origin[axis]));
    operation.origin = origin;
    operation.size = size;
  }
  return script;
}

function normalizeOperationNumbers(value: unknown): unknown {
  const candidate = candidateFromResponse(value);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  const script = structuredClone(candidate) as Record<string, unknown>;
  if (!Array.isArray(script.operations)) return script;
  const normalizeField = (
    operation: Record<string, unknown>,
    field: string,
    fallback: number,
    minimum: number,
    maximum: number,
    required = false,
  ) => {
    if (required || operation[field] !== undefined) {
      operation[field] = normalizedInteger(operation[field], fallback, minimum, maximum);
    }
  };
  for (const item of script.operations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const operation = item as Record<string, unknown>;
    switch (operation.type) {
      case "cylinder":
        normalizeField(operation, "radius", 4, 1, 32, true);
        normalizeField(operation, "height", 6, 1, SCENE_SIZE, true);
        break;
      case "gableRoof":
        normalizeField(operation, "height", 3, 1, 64, true);
        normalizeField(operation, "overhang", 0, 0, 16);
        break;
      case "flatRoof":
        normalizeField(operation, "overhang", 0, 0, 16);
        normalizeField(operation, "thickness", 1, 1, 8);
        break;
      case "entrance":
        normalizeField(operation, "width", 2, 1, 8);
        normalizeField(operation, "height", 3, 2, 10);
        normalizeField(operation, "offset", 0, -32, 32);
        break;
      case "windows":
        normalizeField(operation, "count", 2, 1, 24, true);
        normalizeField(operation, "width", 1, 1, 6);
        normalizeField(operation, "height", 2, 1, 6);
        normalizeField(operation, "sillHeight", 2, 1, 64);
        break;
      case "porch":
        normalizeField(operation, "width", 4, 1, 32, true);
        normalizeField(operation, "depth", 2, 1, 16, true);
        break;
      case "path":
        normalizeField(operation, "length", 8, 2, 48, true);
        normalizeField(operation, "width", 2, 1, 10, true);
        break;
      case "copyMirror":
        if (operation.mode === "mirror") normalizeField(operation, "pivot", 64, 0, SCENE_MAX_COORDINATE, true);
        if (operation.mode === "copy" && Array.isArray(operation.offset) && operation.offset.length === 3) {
          operation.offset = operation.offset.map((coordinate) => normalizedInteger(coordinate, 0, -SCENE_MAX_COORDINATE, SCENE_MAX_COORDINATE));
        }
        break;
    }
  }
  return script;
}

function normalizeInvalidMaterials(value: unknown): unknown {
  const candidate = candidateFromResponse(value);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  const script = structuredClone(candidate) as Record<string, unknown>;
  if (!script.palette || typeof script.palette !== "object" || Array.isArray(script.palette) || !Array.isArray(script.operations)) return script;
  const palette = script.palette as Record<string, unknown>;
  const materialFields = ["material", "wall", "floor"];
  const referencedMaterials = script.operations.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const operation = item as Record<string, unknown>;
    return materialFields.map((field) => operation[field]).filter((material): material is string => typeof material === "string");
  });
  const fallback = Object.values(palette).find((material): material is string => typeof material === "string" && isBlockId(material))
    ?? referencedMaterials.find((material) => isBlockId(material))
    ?? "minecraft:stone_bricks";
  const invalidKeys = Object.keys(palette).filter((key) => {
    const material = palette[key];
    return typeof material !== "string" || !isBlockId(material);
  });
  for (const key of invalidKeys) {
    if (referencedMaterials.includes(key)) palette[key] = fallback;
    else delete palette[key];
  }
  if (!Object.keys(palette).length) palette.primary = fallback;
  for (const item of script.operations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const operation = item as Record<string, unknown>;
    for (const field of materialFields) {
      if (!(field in operation)) continue;
      const material = operation[field];
      const isDirectBlock = typeof material === "string" && isBlockId(material);
      const paletteValue = typeof material === "string" ? palette[material] : undefined;
      const isPaletteReference = typeof paletteValue === "string" && isBlockId(paletteValue);
      if (!isDirectBlock && !isPaletteReference) operation[field] = fallback;
    }
  }
  return script;
}

export function createDeepSeekBuildScriptChat(
  apiKey: string,
  options: { baseUrl?: string; model?: string; fetch?: typeof fetch } = {}
): DeepSeekBuildScriptChat {
  return createAiBuildScriptChat("deepseek", apiKey, options);
}

export function createAiBuildScriptChat(
  provider: AiProvider,
  apiKey: string,
  options: { baseUrl?: string; model?: string; apiMode?: AiApiMode; fetch?: typeof fetch } = {}
): DeepSeekBuildScriptChat {
  const providerName = aiProviderLabel(provider);
  return async ({ messages, temperature, maxTokens }) => {
    const content = await requestAiText({
      provider,
      apiKey,
      messages,
      temperature,
      maxTokens,
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.apiMode ? { apiMode: options.apiMode } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      timeoutMs: 60_000
    });
    try {
      return parseAiJson(content);
    } catch {
      throw new DeepSeekBuildScriptResponseError(`${providerName} returned malformed BuildScript JSON.`);
    }
  };
}

export async function generateWithDeepSeekBuildScript(
  prompt: string,
  apiKey: string,
  options: { chat?: DeepSeekBuildScriptChat; providerName?: string; unlimitedBlocks?: boolean } = {}
): Promise<DeepSeekBuildScriptResult> {
  const chat = options.chat ?? createDeepSeekBuildScriptChat(apiKey);
  const providerName = options.providerName ?? "DeepSeek";
  const budgetOverrides = options.unlimitedBlocks ? UNLIMITED_BLOCK_BUDGETS : {};
  const systemPrompt = options.unlimitedBlocks ? UNLIMITED_BLOCK_SYSTEM_PROMPT : BUILD_SCRIPT_SYSTEM_PROMPT;
  let firstCandidate: unknown;
  let first: ReturnType<typeof evaluateCandidate>;
  try {
    firstCandidate = await chat({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      temperature: 0.35,
      maxTokens: BUILD_SCRIPT_MAX_TOKENS
    });
    first = evaluateCandidate(firstCandidate, budgetOverrides);
  } catch (error) {
    if (!(error instanceof DeepSeekBuildScriptResponseError)) throw error;
    firstCandidate = null;
    first = { diagnostics: [error.message] };
  }
  if (first.compilation) {
    return { ...first.compilation, summary: first.compilation.script.name, attempts: 1, repaired: false };
  }

  let repairedCandidate: unknown;
  try {
    repairedCandidate = await chat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: repairPrompt(prompt, candidateFromResponse(firstCandidate), first.diagnostics) }
      ],
      temperature: 0.05,
      maxTokens: BUILD_SCRIPT_MAX_TOKENS
    });
  } catch (error) {
    throw new DeepSeekBuildScriptError(
      error instanceof Error ? error.message : `${providerName} BuildScript repair request failed.`,
      2,
      first.diagnostics
    );
  }
  const repaired = evaluateCandidate(repairedCandidate, budgetOverrides);
  if (!repaired.compilation) {
    let localCandidate = repairedCandidate;
    let localResult = repaired;
    const materialIssuesOnly = localResult.diagnostics.length > 0 && localResult.diagnostics.every((diagnostic) =>
      /^palette\.[a-z0-9_-]+ is not a supported Minecraft block ID\.$/i.test(diagnostic) ||
      /^operations\[\d+\]\.(?:material|wall|floor) (?:must be a palette key or supported Minecraft block ID\.|references unknown material )/i.test(diagnostic)
    );
    if (materialIssuesOnly) {
      localCandidate = normalizeInvalidMaterials(localCandidate);
      localResult = evaluateCandidate(localCandidate, budgetOverrides);
      if (localResult.compilation) {
        return { ...localResult.compilation, summary: localResult.compilation.script.name, attempts: 2, repaired: true };
      }
    }
    const operationNumbersOnly = localResult.diagnostics.length > 0 && localResult.diagnostics.every((diagnostic) =>
      /^operations\[\d+\]\.(?:radius|height|overhang|thickness|width|offset|count|sillHeight|depth|length|pivot)(?:\[\d\])? must be an integer from /.test(diagnostic)
    );
    if (operationNumbersOnly) {
      localCandidate = normalizeOperationNumbers(localCandidate);
      localResult = evaluateCandidate(localCandidate, budgetOverrides);
      if (localResult.compilation) {
        return { ...localResult.compilation, summary: localResult.compilation.script.name, attempts: 2, repaired: true };
      }
    }
    const boxCoordinatesOnly = localResult.diagnostics.length > 0 && localResult.diagnostics.every((diagnostic) =>
      /^operations\[\d+\]\.(?:origin|size)\[\d\] must be an integer from /.test(diagnostic)
    );
    if (boxCoordinatesOnly) {
      localCandidate = normalizeBoxCoordinates(localCandidate);
      localResult = evaluateCandidate(localCandidate, budgetOverrides);
      if (localResult.compilation) {
        return { ...localResult.compilation, summary: localResult.compilation.script.name, attempts: 2, repaired: true };
      }
    }
    const entranceDimensionsOnly = localResult.diagnostics.length > 0 && localResult.diagnostics.every((diagnostic) =>
      (diagnostic.includes("corner supports") && diagnostic.includes("offset")) ||
      diagnostic.includes("must leave at least one wall block above the entrance")
    );
    if (entranceDimensionsOnly) {
      localCandidate = normalizeEntrances(localCandidate);
      localResult = evaluateCandidate(localCandidate, budgetOverrides);
      if (localResult.compilation) {
        return { ...localResult.compilation, summary: localResult.compilation.script.name, attempts: 2, repaired: true };
      }
    }
    throw new DeepSeekBuildScriptError(
      `${providerName} returned an invalid BuildScript after one repair attempt: ${localResult.diagnostics.join(" ")}`,
      2,
      localResult.diagnostics
    );
  }
  return { ...repaired.compilation, summary: repaired.compilation.script.name, attempts: 2, repaired: true };
}

export function getBuildScriptFromResult(result: DeepSeekBuildScriptResult): BuildScript {
  return result.script;
}
