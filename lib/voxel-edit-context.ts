import { getBoundingBox } from "./structure-analysis";
import type {
  BlockId,
  Box3D,
  GenerationMetadata,
  SemanticRegion,
  StructurePatch,
  VoxelStructure
} from "./structure";

export const UNOWNED_COMPONENT_ID = "__unowned__";

export type VoxelEditComponent = {
  ownerId: string;
  bounds: Box3D;
  blockCount: number;
  materials: BlockId[];
  buildScriptOperation?: { id: string; type: string };
};

export type VoxelEditContext = {
  scene: {
    bounds: { width: 64; depth: 64; maxHeight: 64 };
    occupiedBounds: Box3D | null;
    blockCount: number;
    palette: BlockId[];
  };
  components: VoxelEditComponent[];
  generation?: {
    prompt: string;
    provider: GenerationMetadata["provider"];
    seed: number;
    compilerVersion: string;
    buildScriptOperations: Array<{ id: string; type: string }>;
  };
  writableBounds?: Box3D;
  lockedRegions: Array<{ id: string; bounds: Box3D }>;
};

type ContextOptions = {
  generationMetadata?: GenerationMetadata;
  semanticRegions?: SemanticRegion[];
  writableBounds?: Box3D;
};

export function createVoxelEditContext(structure: VoxelStructure, options: ContextOptions = {}): VoxelEditContext {
  const operationById = new Map(
    (options.generationMetadata?.buildScript?.operations ?? []).map((operation) => [
      operation.id,
      { id: operation.id, type: operation.type }
    ])
  );
  const groups = new Map<string, { bounds: Box3D; blockCount: number; materials: Set<BlockId> }>();

  for (const block of structure.blocks) {
    const ownerId = block.ownerId ?? UNOWNED_COMPONENT_ID;
    const current = groups.get(ownerId);
    if (!current) {
      groups.set(ownerId, {
        bounds: { minX: block.x, minY: block.y, minZ: block.z, maxX: block.x, maxY: block.y, maxZ: block.z },
        blockCount: 1,
        materials: new Set([block.id])
      });
      continue;
    }
    current.bounds.minX = Math.min(current.bounds.minX, block.x);
    current.bounds.minY = Math.min(current.bounds.minY, block.y);
    current.bounds.minZ = Math.min(current.bounds.minZ, block.z);
    current.bounds.maxX = Math.max(current.bounds.maxX, block.x);
    current.bounds.maxY = Math.max(current.bounds.maxY, block.y);
    current.bounds.maxZ = Math.max(current.bounds.maxZ, block.z);
    current.blockCount += 1;
    current.materials.add(block.id);
  }

  const components = Array.from(groups, ([ownerId, group]) => ({
    ownerId,
    bounds: group.bounds,
    blockCount: group.blockCount,
    materials: Array.from(group.materials).sort(),
    ...(operationById.get(ownerId) ? { buildScriptOperation: operationById.get(ownerId) } : {})
  })).sort((a, b) => a.ownerId.localeCompare(b.ownerId));

  const metadata = options.generationMetadata;
  const context: VoxelEditContext = {
    scene: {
      bounds: { width: 64, depth: 64, maxHeight: 64 },
      occupiedBounds: getBoundingBox(structure),
      blockCount: structure.blocks.length,
      palette: Array.from(new Set(structure.blocks.map((block) => block.id))).sort()
    },
    components,
    ...(metadata ? {
      generation: {
        prompt: metadata.prompt,
        provider: metadata.provider,
        seed: metadata.seed,
        compilerVersion: metadata.compilerVersion,
        buildScriptOperations: Array.from(operationById.values())
      }
    } : {}),
    ...(options.writableBounds ? { writableBounds: { ...options.writableBounds } } : {}),
    lockedRegions: (options.semanticRegions ?? [])
      .filter((region) => region.locked)
      .map((region) => ({ id: region.id, bounds: { ...region.bounds } }))
  };
  return context;
}

export class VoxelEditScopeError extends Error {}

export function assertVoxelEditScope(patch: StructurePatch, affectedOwnerIds: string[]) {
  const allowed = new Set(affectedOwnerIds);
  const touched = new Set<string>();
  for (const change of patch.changes) {
    const previous = change.type === "add" ? undefined : change.type === "replace" ? change.before : change.block;
    if (previous) touched.add(previous.ownerId ?? UNOWNED_COMPONENT_ID);
  }
  const unrelated = Array.from(touched).filter((ownerId) => !allowed.has(ownerId)).sort();
  if (unrelated.length) {
    throw new VoxelEditScopeError(`The edit would modify undeclared component${unrelated.length === 1 ? "" : "s"}: ${unrelated.join(", ")}.`);
  }
}
