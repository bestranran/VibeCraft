import type { BuildScript } from "./build-script";

export type BlockId = `minecraft:${string}`;

export type VoxelBlock = {
  x: number;
  y: number;
  z: number;
  id: BlockId;
  ownerId?: string;
};

export type VoxelStructure = {
  name: string;
  size: [number, number, number];
  blocks: VoxelBlock[];
};

export type Position = [number, number, number];

export type BlockChange =
  | { type: "add"; block: VoxelBlock }
  | { type: "remove"; block: VoxelBlock }
  | { type: "replace"; before: VoxelBlock; after: VoxelBlock };

export type StructurePatch = { changes: BlockChange[] };

export type BuildingOperation =
  | { type: "resizeRoof"; heightDelta: number }
  | { type: "addWindows"; side: "front" | "back" | "left" | "right" | "all"; count: number }
  | { type: "addChimney"; side: "left" | "right" }
  | { type: "addPath"; length: number; width: number; material: BlockId }
  | { type: "changePalette"; from?: BlockId; to: BlockId; region?: "all" | "walls" | "roof" | "foundation" }
  | { type: "addFloor"; count: number }
  | { type: "removeFeature"; feature: "chimney" | "path" | "windows" };

export type EditTransaction = {
  id: string;
  prompt: string;
  operations: BuildingOperation[];
  toolCalls?: VoxelToolCall[];
  patch: StructurePatch;
  before: VoxelStructure;
  after: VoxelStructure;
  createdAt: number;
};

export type PendingEdit = {
  prompt: string;
  operations: BuildingOperation[];
  toolCalls?: VoxelToolCall[];
  patch: StructurePatch;
  preview: VoxelStructure;
};

export type Box2D = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
};

export type Box3D = Box2D & {
  minY: number;
  maxY: number;
};

export type SceneBounds = {
  width: 64;
  depth: 64;
  maxHeight: number;
};

export type SemanticRegion = {
  id: string;
  bounds: Box3D;
  locked?: boolean;
};

export type ThemeSpec = {
  name: string;
  palette: BlockId[];
};

export type RoadSpec = {
  id: string;
  bounds: Box2D;
  width: number;
  material: BlockId;
};

export type PlannedBuildingSpec = {
  width: number;
  depth: number;
  height: number;
  roof: "flat" | "gable";
  wallMaterial: BlockId;
  roofMaterial: BlockId;
};

export type LotSpec = {
  id: string;
  bounds: Box2D;
  purpose: "residential" | "commercial" | "industrial" | "utility";
  building: PlannedBuildingSpec;
  locked?: boolean;
};

export type LandmarkSpec = {
  id: string;
  bounds: Box2D;
  kind: string;
};

export type ConnectionSpec = {
  id: string;
  fromRegionId: string;
  toRegionId: string;
  kind: "road" | "bridge" | "pipe";
};

export type WorldPlan = {
  id: string;
  name: string;
  theme: ThemeSpec;
  bounds: SceneBounds;
  roads: RoadSpec[];
  lots: LotSpec[];
  landmarks: LandmarkSpec[];
  connections: ConnectionSpec[];
  regions: SemanticRegion[];
};

export type WorldPlanMetadata = {
  provider: "deepseek" | "local";
  prompt: string;
  seed: number;
  planVersion: 1;
};

export type GenerationMetadata = {
  prompt: string;
  seed: number;
  provider: "deepseek-buildscript" | "local";
  compilerVersion: string;
  buildScript?: BuildScript;
  operationCount: number;
  blockCount: number;
  validationWarnings: string[];
};

export type ToolWriteMode = "overwrite" | "empty";

export type VoxelToolCall =
  | { type: "fill"; from: Position; to: Position; material: BlockId; ownerId?: string; mode?: ToolWriteMode }
  | { type: "remove"; from: Position; to: Position }
  | { type: "replace"; from: Position; to: Position; fromMaterial: BlockId; toMaterial: BlockId; ownerId?: string }
  | { type: "line"; from: Position; to: Position; material: BlockId; ownerId?: string; mode?: ToolWriteMode }
  | { type: "copy"; source: Box3D; offset: Position; ownerId?: string; mode?: ToolWriteMode }
  | { type: "mirror"; source: Box3D; axis: "x" | "z"; pivot: number; ownerId?: string; mode?: ToolWriteMode };

export type BuildingDocument = {
  structure: VoxelStructure;
  generationMetadata?: GenerationMetadata;
  worldPlan?: WorldPlan;
  worldPlanMetadata?: WorldPlanMetadata;
  semanticRegions: SemanticRegion[];
  history: EditTransaction[];
  future: EditTransaction[];
  pendingEdit: PendingEdit | null;
};

export type QualityReport = {
  score: number;
  warnings: string[];
  metrics: {
    blockCount: number;
    paletteSize: number;
    isolatedBlocks: number;
    duplicateCoordinates: number;
  };
};

export const BLOCK_IDS = [
  "minecraft:oak_planks",
  "minecraft:spruce_planks",
  "minecraft:stone_bricks",
  "minecraft:cobblestone",
  "minecraft:glass_pane",
  "minecraft:oak_log",
  "minecraft:spruce_stairs",
  "minecraft:brick",
  "minecraft:sandstone",
  "minecraft:red_sandstone",
  "minecraft:dark_oak_planks",
  "minecraft:lantern",
  "minecraft:black_concrete",
  "minecraft:gray_concrete",
  "minecraft:cyan_concrete",
  "minecraft:magenta_concrete",
  "minecraft:yellow_concrete",
  "minecraft:iron_block",
  "minecraft:polished_deepslate",
  "minecraft:oxidized_copper",
  "minecraft:sea_lantern"
] as const satisfies readonly BlockId[];

export function isBlockId(value: string): value is BlockId {
  return /^minecraft:[a-z0-9_]+$/.test(value) && !["minecraft:air", "minecraft:cave_air", "minecraft:void_air", "minecraft:block_id"].includes(value);
}

export const BLOCK_LABELS: Partial<Record<BlockId, string>> = {
  "minecraft:oak_planks": "Oak Planks",
  "minecraft:spruce_planks": "Spruce Planks",
  "minecraft:stone_bricks": "Stone Bricks",
  "minecraft:cobblestone": "Cobblestone",
  "minecraft:glass_pane": "Glass Pane",
  "minecraft:oak_log": "Oak Log",
  "minecraft:spruce_stairs": "Spruce Stairs",
  "minecraft:brick": "Brick",
  "minecraft:sandstone": "Sandstone",
  "minecraft:red_sandstone": "Red Sandstone",
  "minecraft:dark_oak_planks": "Dark Oak Planks",
  "minecraft:lantern": "Lantern",
  "minecraft:black_concrete": "Black Concrete",
  "minecraft:gray_concrete": "Gray Concrete",
  "minecraft:cyan_concrete": "Cyan Concrete",
  "minecraft:magenta_concrete": "Magenta Concrete",
  "minecraft:yellow_concrete": "Yellow Concrete",
  "minecraft:iron_block": "Iron Block",
  "minecraft:polished_deepslate": "Polished Deepslate",
  "minecraft:oxidized_copper": "Oxidized Copper",
  "minecraft:sea_lantern": "Sea Lantern"
};

export const BLOCK_COLORS: Partial<Record<BlockId, string>> = {
  "minecraft:oak_planks": "#a87943",
  "minecraft:spruce_planks": "#6f4b2d",
  "minecraft:stone_bricks": "#808077",
  "minecraft:cobblestone": "#6f6f68",
  "minecraft:glass_pane": "#9ed2d6",
  "minecraft:oak_log": "#7a4f2a",
  "minecraft:spruce_stairs": "#574025",
  "minecraft:brick": "#9c4934",
  "minecraft:sandstone": "#d6bd79",
  "minecraft:red_sandstone": "#b66d43",
  "minecraft:dark_oak_planks": "#3f2c20",
  "minecraft:lantern": "#f0b44f",
  "minecraft:black_concrete": "#17181b",
  "minecraft:gray_concrete": "#4b5054",
  "minecraft:cyan_concrete": "#168892",
  "minecraft:magenta_concrete": "#b13cab",
  "minecraft:yellow_concrete": "#e3b729",
  "minecraft:iron_block": "#d8dddc",
  "minecraft:polished_deepslate": "#34343b",
  "minecraft:oxidized_copper": "#4f9f89",
  "minecraft:sea_lantern": "#c7e9df"
};

const BLOCK_COLOR_HINTS: Array<[string, string]> = [
  ["red", "#b53b35"], ["orange", "#d97824"], ["yellow", "#e3b729"], ["lime", "#6fbf32"],
  ["green", "#3f7f48"], ["cyan", "#168892"], ["light_blue", "#4fa6d8"], ["blue", "#3559a8"],
  ["purple", "#763f9f"], ["magenta", "#b13cab"], ["pink", "#d97b98"], ["brown", "#70452f"],
  ["black", "#17181b"], ["gray", "#565b60"], ["white", "#d9dddc"], ["glass", "#9ed2d6"],
  ["copper", "#9a5f43"], ["gold", "#e1b84b"], ["iron", "#c5cbca"], ["quartz", "#ddd7c8"],
  ["sand", "#d6bd79"], ["wood", "#8b623c"], ["log", "#715037"], ["stone", "#777773"]
];

export function getBlockColor(id: BlockId): string {
  const known = BLOCK_COLORS[id];
  if (known) return known;
  const name = id.slice("minecraft:".length);
  const hinted = BLOCK_COLOR_HINTS.find(([token]) => name.includes(token));
  if (hinted) return hinted[1];
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 32% 48%)`;
}

export function getBlockLabel(id: BlockId): string {
  return BLOCK_LABELS[id] ?? id.slice("minecraft:".length).split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

export const EXAMPLE_PROMPTS = [
  "a detailed cyberpunk apartment tower with layered setbacks, neon-like lantern bands, rooftop machinery, pipes, balconies, and a dramatic entrance",
  "a grand medieval guild hall with two wings, a tall closed gable roof, stone foundation, timber framing, chimney, and supported entrance canopy",
  "a Japanese cliffside tea pavilion with layered roofs, open veranda, timber columns, lanterns, and an asymmetrical stone base"
];

export function getUsedBlockTypes(structure: VoxelStructure): BlockId[] {
  return Array.from(new Set(structure.blocks.map((block) => block.id))).sort();
}
