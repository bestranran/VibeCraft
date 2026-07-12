export type BlockId =
  | "minecraft:oak_planks"
  | "minecraft:spruce_planks"
  | "minecraft:stone_bricks"
  | "minecraft:cobblestone"
  | "minecraft:glass_pane"
  | "minecraft:oak_log"
  | "minecraft:spruce_stairs"
  | "minecraft:brick"
  | "minecraft:sandstone"
  | "minecraft:red_sandstone"
  | "minecraft:dark_oak_planks"
  | "minecraft:lantern";

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
  worldPlan?: WorldPlan;
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
  "minecraft:lantern"
] as const satisfies readonly BlockId[];

export function isBlockId(value: string): value is BlockId {
  return (BLOCK_IDS as readonly string[]).includes(value);
}

export const BLOCK_LABELS: Record<BlockId, string> = {
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
  "minecraft:lantern": "Lantern"
};

export const BLOCK_COLORS: Record<BlockId, string> = {
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
  "minecraft:lantern": "#f0b44f"
};

export const EXAMPLE_PROMPTS = [
  "a cozy medieval cottage with a steep roof and chimney",
  "a small Japanese tea house with a stone path",
  "a desert sandstone tower"
];

export function getUsedBlockTypes(structure: VoxelStructure): BlockId[] {
  return Array.from(new Set(structure.blocks.map((block) => block.id))).sort();
}
