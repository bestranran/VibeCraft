import { analyzeStructureQuality } from "./structure-analysis";
import { BLOCK_IDS, isBlockId } from "./structure";
import type { BlockId, VoxelStructure, VoxelToolCall } from "./structure";
import { executeVoxelTools, validateVoxelToolCalls } from "./voxel-tools";

const MATERIALS = BLOCK_IDS;

export type VoxelAgentResult = {
  structure: VoxelStructure;
  toolCalls: VoxelToolCall[];
  summary: string;
  reports: ReturnType<typeof executeVoxelTools>["reports"];
  reviewed: boolean;
  assessment: AgentBuildAssessment;
};

export type AgentBuildAssessment = {
  connectedRatio: number;
  density: number;
  warnings: string[];
};

const BLUEPRINT_PROMPT = `You are the lead architect for a Minecraft voxel build. Produce a compact construction blueprint, not block operations.
Return JSON only with: name, summary, footprint {minX,maxX,minZ,maxZ}, baseY, wallTopY, roofTopY, entrance {side,center,width,height}, palette {foundation,walls,roof,accent,glass}, majorVolumes, roofGeometry, and details.
Use x/z 4..59 and y 0..63, center near 32,32, and keep the footprint within about 48x48. Specify exact integer coordinates and a coherent asymmetrical silhouette. The interior must be hollow and the entrance traversable. Keep the response under 900 words.
Allowed materials: ${MATERIALS.join(", ")}.`;

const STAGE_RULES = `You are a Minecraft voxel CAD construction agent. Return JSON only: {"summary":"stage summary","toolCalls":[...]}. Return only NEW calls for this stage.
Use the compact array DSL below. Never return verbose tool objects and never repeat a completed stage:
- ["F",x1,y1,z1,x2,y2,z2,"material","owner"] fill
- ["D",x1,y1,z1,x2,y2,z2] remove
- ["L",x1,y1,z1,x2,y2,z2,"material","owner"] line
- ["X",x1,y1,z1,x2,y2,z2,"fromMaterial","toMaterial","owner"] replace
Example: {"summary":"four hollow walls","toolCalls":[["F",12,1,12,40,8,12,"minecraft:brick","wall-north"],["D",25,1,12,27,3,12]]}
All coordinates must remain x/z 0..63 and y 0..63. Follow the supplied blueprint exactly. Prefer large planes and lines; never output individual setblock commands. Do not create a solid building. Features must be face-connected or physically supported.
Allowed materials: ${MATERIALS.join(", ")}.`;

const STAGES = [
  { id: "foundation-shell", instruction: "Use 6-18 calls. Build foundation, floors, separate exterior wall faces, structural columns, and major attached volumes. Keep interiors hollow. Leave later roof and decorative work for other stages." },
  { id: "roof-openings", instruction: "Use 6-20 calls. Add a completely connected roof, ridges, eaves and closed gables. Carve a two-block-high entrance and intentional window openings, then place glass. No floating roof rows or unsupported slabs." },
  { id: "details", instruction: "Use 6-24 calls. Add supported facade depth, trim, balconies, pipes, chimney or roof machinery, signs and lighting requested by the user. Improve silhouette without filling the interior or blocking the entrance." }
] as const;

async function chat(apiKey: string, messages: Array<{ role: "system" | "user"; content: string }>, temperature: number, maxTokens = 4096) {
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || "deepseek-chat", temperature, max_tokens: maxTokens, response_format: { type: "json_object" }, messages }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`DeepSeek voxel agent failed (${response.status}).`);
  const data = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty voxel plan.");
  if (choice?.finish_reason === "length") throw new Error("DeepSeek truncated one construction stage. Retry the build; your previous structure was preserved.");
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? normalized.slice(start, end + 1) : normalized;
  try { return JSON.parse(candidate) as unknown; } catch { throw new Error("DeepSeek returned malformed voxel-plan JSON. Please retry; the previous building was not replaced."); }
}

export function parseCompactStage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DeepSeek returned an invalid compact construction stage.");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.toolCalls)) throw new Error("DeepSeek's construction stage is missing tool calls.");
  const expanded = raw.toolCalls.map((call, index) => {
    if (!Array.isArray(call) || typeof call[0] !== "string") throw new Error(`Compact tool call ${index + 1} is invalid.`);
    const from = [call[1], call[2], call[3]];
    const to = [call[4], call[5], call[6]];
    if (call[0] === "F") return { type: "fill", from, to, material: normalizeAgentMaterial(call[7]), ownerId: call[8] };
    if (call[0] === "D") return { type: "remove", from, to };
    if (call[0] === "L") return { type: "line", from, to, material: normalizeAgentMaterial(call[7]), ownerId: call[8] };
    if (call[0] === "X") return { type: "replace", from, to, fromMaterial: normalizeAgentMaterial(call[7]), toMaterial: normalizeAgentMaterial(call[8]), ownerId: call[9] };
    throw new Error(`Unsupported compact tool code: ${call[0]}`);
  });
  return {
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 300) : "Construction stage",
    toolCalls: validateVoxelToolCalls(expanded)
  };
}

export function normalizeAgentMaterial(value: unknown): BlockId {
  if (typeof value !== "string") throw new Error("Agent material must be a Minecraft block ID.");
  const normalized = value.includes(":") ? value.toLowerCase() : `minecraft:${value.toLowerCase()}`;
  const name = normalized.replace("minecraft:", "");
  if (/(sea_lantern|glowstone|shroomlight|light)/.test(name)) return "minecraft:sea_lantern";
  if (/(cyan|teal|prismarine)/.test(name)) return "minecraft:cyan_concrete";
  if (/(magenta|purple|pink)/.test(name)) return "minecraft:magenta_concrete";
  if (/(yellow|gold)/.test(name)) return "minecraft:yellow_concrete";
  if (/(black|obsidian)/.test(name)) return "minecraft:black_concrete";
  if (/(gray|grey)/.test(name)) return "minecraft:gray_concrete";
  if (/(deepslate|slate)/.test(name)) return "minecraft:polished_deepslate";
  if (/(copper|verdigris)/.test(name)) return "minecraft:oxidized_copper";
  if (/(iron|metal|steel)/.test(name)) return "minecraft:iron_block";
  if (/glass/.test(name)) return "minecraft:glass_pane";
  if (/(spruce|fir)/.test(name)) return "minecraft:spruce_planks";
  if (/(dark_oak|dark_wood)/.test(name)) return "minecraft:dark_oak_planks";
  if (/(oak|wood|plank)/.test(name)) return "minecraft:oak_planks";
  if (/(red_sand|terracotta)/.test(name)) return "minecraft:red_sandstone";
  if (/sand/.test(name)) return "minecraft:sandstone";
  if (/(brick|nether)/.test(name)) return "minecraft:brick";
  if (/(stone|cobble)/.test(name)) return "minecraft:stone_bricks";
  if (isBlockId(normalized)) return normalized;
  throw new Error(`Unsupported agent material: ${value}.`);
}

export async function generateWithVoxelAgent(prompt: string, apiKey: string): Promise<VoxelAgentResult> {
  const blueprintRaw = await chat(apiKey, [{ role: "system", content: BLUEPRINT_PROMPT }, { role: "user", content: prompt }], 0.4, 2048);
  if (!blueprintRaw || typeof blueprintRaw !== "object" || Array.isArray(blueprintRaw)) throw new Error("DeepSeek returned an invalid building blueprint.");
  const blueprint = blueprintRaw as Record<string, unknown>;
  const name = typeof blueprint.name === "string" ? slug(blueprint.name) : "deepseek-agent-build";
  const summary = typeof blueprint.summary === "string" ? blueprint.summary.slice(0, 300) : "Staged DeepSeek voxel-agent build";
  const allCalls: VoxelToolCall[] = [];
  const completedStages: Array<{ id: string; summary: string; toolCount: number }> = [];
  let execution: ReturnType<typeof execute> | null = null;

  for (const stage of STAGES) {
    const progress = execution ? {
      blockCount: execution.structure.blocks.length,
      quality: analyzeStructureQuality(execution.structure),
      assessment: assessAgentBuild(execution.structure)
    } : { blockCount: 0 };
    const stageInput = JSON.stringify({ userRequest: prompt, blueprint, stage: stage.id, instruction: stage.instruction, completedStages, currentProgress: progress });
    let stageRaw: unknown;
    try {
      stageRaw = await chat(apiKey, [{ role: "system", content: STAGE_RULES }, { role: "user", content: stageInput }], stage.id === "details" ? 0.3 : 0.1, 3072);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("truncated")) throw error;
      const retryInput = `${stageInput}\nThe previous response was truncated. Return a compact valid JSON response with at most 10 DSL calls. Do not add prose.`;
      stageRaw = await chat(apiKey, [{ role: "system", content: STAGE_RULES }, { role: "user", content: retryInput }], 0.05, 3072);
    }
    const stagePlan = parseCompactStage(stageRaw);
    if (stagePlan.toolCalls.length > 48) throw new Error(`DeepSeek returned more than 48 calls for the ${stage.id} stage.`);
    if (allCalls.length + stagePlan.toolCalls.length > 120) throw new Error("DeepSeek's complete construction plan exceeds the 120-call safety budget.");
    allCalls.push(...stagePlan.toolCalls);
    execution = execute(empty(name), allCalls);
    completedStages.push({ id: stage.id, summary: stagePlan.summary, toolCount: stagePlan.toolCalls.length });
  }

  if (!execution) throw new Error("DeepSeek did not produce any construction stages.");
  const assessment = assessAgentBuild(execution.structure);
  if (execution.structure.blocks.length < 80) throw new Error("The voxel agent produced too little geometry to evaluate as a building.");
  return { structure: execution.structure, toolCalls: allCalls, summary, reports: execution.reports, reviewed: true, assessment };
}

export function assessAgentBuild(structure: VoxelStructure): AgentBuildAssessment {
  if (!structure.blocks.length) return { connectedRatio: 0, density: 0, warnings: ["The build is empty."] };
  const occupied = new Set(structure.blocks.filter((block) => block.id !== "minecraft:lantern").map((block) => `${block.x},${block.y},${block.z}`));
  const remaining = new Set(occupied);
  let largest = 0;
  let largestKeys: string[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as string;
    const queue = [first]; const component: string[] = []; remaining.delete(first); let size = 0;
    while (queue.length) {
      const key = queue.pop()!; component.push(key); size += 1;
      const [x,y,z] = key.split(",").map(Number);
      for (const neighbor of [`${x+1},${y},${z}`,`${x-1},${y},${z}`,`${x},${y+1},${z}`,`${x},${y-1},${z}`,`${x},${y},${z+1}`,`${x},${y},${z-1}`]) {
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    if (size > largest) { largest = size; largestKeys = component; }
  }
  const mainPoints = largestKeys.map((key) => key.split(",").map(Number));
  const xs = mainPoints.map((point) => point[0]), ys = mainPoints.map((point) => point[1]), zs = mainPoints.map((point) => point[2]);
  const volume = (Math.max(...xs)-Math.min(...xs)+1) * (Math.max(...ys)-Math.min(...ys)+1) * (Math.max(...zs)-Math.min(...zs)+1);
  const connectedRatio = occupied.size ? largest / occupied.size : 0;
  const density = largest / Math.max(1, volume);
  const warnings: string[] = [];
  if (connectedRatio < 0.995) warnings.push("Some geometry is disconnected from the main building.");
  if (density > 0.72) warnings.push("The building may be too solid internally.");
  if (new Set(structure.blocks.map((block) => block.id)).size < 3) warnings.push("The material palette lacks contrast.");
  return { connectedRatio: Math.round(connectedRatio * 1000) / 1000, density: Math.round(density * 1000) / 1000, warnings };
}

function execute(structure: VoxelStructure, calls: VoxelToolCall[]) {
  return executeVoxelTools(structure, calls, { bounds: { width: 64, depth: 64, maxHeight: 64 }, budgets: { maxCalls: 120, maxCoordinates: 500_000, maxChangedBlocks: 100_000 } });
}

function empty(name: string): VoxelStructure { return { name, size: [0, 0, 0], blocks: [] }; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "deepseek-agent-build"; }
