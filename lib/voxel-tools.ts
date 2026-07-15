import { coordinateKey, diffStructures, normalizeStructure } from "./patches";
import { isBlockId } from "./structure";
import type {
  BlockId,
  Box3D,
  PendingEdit,
  Position,
  SceneBounds,
  SemanticRegion,
  StructurePatch,
  ToolWriteMode,
  VoxelBlock,
  VoxelStructure,
  VoxelToolCall
} from "./structure";

export type VoxelToolBudgets = {
  maxCalls: number;
  maxCoordinates: number;
  maxChangedBlocks: number;
};

export type VoxelToolReport = {
  type: VoxelToolCall["type"];
  added: number;
  removed: number;
  replaced: number;
  skipped: number;
  visited: number;
};

export type VoxelToolExecution = {
  structure: VoxelStructure;
  patch: StructurePatch;
  reports: VoxelToolReport[];
};

export const DEFAULT_TOOL_BUDGETS: VoxelToolBudgets = {
  maxCalls: 16,
  maxCoordinates: 100_000,
  maxChangedBlocks: 20_000
};

export class VoxelToolError extends Error {}

type BlockMap = Map<string, VoxelBlock>;

function integer(value: unknown, field: string): number {
  if (!Number.isInteger(value)) throw new VoxelToolError(`${field} must be an integer.`);
  return value as number;
}

function position(value: unknown, field: string): Position {
  if (!Array.isArray(value) || value.length !== 3) throw new VoxelToolError(`${field} must contain x, y, and z.`);
  return [integer(value[0], `${field}.x`), integer(value[1], `${field}.y`), integer(value[2], `${field}.z`)];
}

function box(value: unknown, field: string): Box3D {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VoxelToolError(`${field} must be a box.`);
  const raw = value as Record<string, unknown>;
  const result = {
    minX: integer(raw.minX, `${field}.minX`), minY: integer(raw.minY, `${field}.minY`), minZ: integer(raw.minZ, `${field}.minZ`),
    maxX: integer(raw.maxX, `${field}.maxX`), maxY: integer(raw.maxY, `${field}.maxY`), maxZ: integer(raw.maxZ, `${field}.maxZ`)
  };
  if (result.minX > result.maxX || result.minY > result.maxY || result.minZ > result.maxZ) {
    throw new VoxelToolError(`${field} minimums cannot exceed its maximums.`);
  }
  return result;
}

function material(value: unknown, field: string): BlockId {
  if (typeof value !== "string" || !isBlockId(value)) throw new VoxelToolError(`${field} is not a supported block material.`);
  return value;
}

function owner(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)) throw new VoxelToolError("ownerId is invalid.");
  return value;
}

function mode(value: unknown): ToolWriteMode | undefined {
  if (value === undefined) return undefined;
  if (value !== "overwrite" && value !== "empty") throw new VoxelToolError("mode must be overwrite or empty.");
  return value;
}

export function validateVoxelToolCalls(value: unknown): VoxelToolCall[] {
  if (!Array.isArray(value) || !value.length) throw new VoxelToolError("At least one voxel tool call is required.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new VoxelToolError(`Tool call ${index + 1} is invalid.`);
    const raw = item as Record<string, unknown>;
    const from = () => position(raw.from, `toolCalls[${index}].from`);
    const to = () => position(raw.to, `toolCalls[${index}].to`);
    if (raw.type === "fill") return { type: raw.type, from: from(), to: to(), material: material(raw.material, "material"), ...(owner(raw.ownerId) ? { ownerId: owner(raw.ownerId) } : {}), ...(mode(raw.mode) ? { mode: mode(raw.mode) } : {}) };
    if (raw.type === "remove") return { type: raw.type, from: from(), to: to() };
    if (raw.type === "replace") return { type: raw.type, from: from(), to: to(), fromMaterial: material(raw.fromMaterial, "fromMaterial"), toMaterial: material(raw.toMaterial, "toMaterial"), ...(owner(raw.ownerId) ? { ownerId: owner(raw.ownerId) } : {}) };
    if (raw.type === "line") return { type: raw.type, from: from(), to: to(), material: material(raw.material, "material"), ...(owner(raw.ownerId) ? { ownerId: owner(raw.ownerId) } : {}), ...(mode(raw.mode) ? { mode: mode(raw.mode) } : {}) };
    if (raw.type === "copy") return { type: raw.type, source: box(raw.source, "source"), offset: position(raw.offset, "offset"), ...(owner(raw.ownerId) ? { ownerId: owner(raw.ownerId) } : {}), ...(mode(raw.mode) ? { mode: mode(raw.mode) } : {}) };
    if (raw.type === "mirror") {
      if (raw.axis !== "x" && raw.axis !== "z") throw new VoxelToolError("mirror axis must be x or z.");
      return { type: raw.type, source: box(raw.source, "source"), axis: raw.axis, pivot: integer(raw.pivot, "pivot"), ...(owner(raw.ownerId) ? { ownerId: owner(raw.ownerId) } : {}), ...(mode(raw.mode) ? { mode: mode(raw.mode) } : {}) };
    }
    throw new VoxelToolError(`Unsupported voxel tool: ${String(raw.type)}`);
  });
}

function orderedBox(from: Position, to: Position): Box3D {
  return { minX: Math.min(from[0], to[0]), minY: Math.min(from[1], to[1]), minZ: Math.min(from[2], to[2]), maxX: Math.max(from[0], to[0]), maxY: Math.max(from[1], to[1]), maxZ: Math.max(from[2], to[2]) };
}

function* coordinates(bounds: Box3D): Generator<Position> {
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) yield [x, y, z];
    }
  }
}

function lineCoordinates(from: Position, to: Position): Position[] {
  const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), Math.abs(to[2] - from[2]));
  if (!steps) return [[...from]];
  const result: Position[] = [];
  const seen = new Set<string>();
  for (let step = 0; step <= steps; step += 1) {
    const point: Position = [0, 1, 2].map((axis) => Math.round(from[axis] + ((to[axis] - from[axis]) * step) / steps)) as Position;
    const key = point.join(",");
    if (!seen.has(key)) { seen.add(key); result.push(point); }
  }
  return result;
}

function contains(box: Box3D, [x, y, z]: Position): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && z >= box.minZ && z <= box.maxZ;
}

function assertSceneBounds(point: Position, bounds: SceneBounds) {
  const [x, y, z] = point;
  if (x < 0 || x >= bounds.width || z < 0 || z >= bounds.depth || y < 0 || y >= bounds.maxHeight) {
    throw new VoxelToolError(`Coordinate ${point.join(",")} is outside the ${bounds.width}×${bounds.depth}×${bounds.maxHeight} scene.`);
  }
}

function countPatch(patch: StructurePatch) {
  return {
    added: patch.changes.filter((change) => change.type === "add").length,
    removed: patch.changes.filter((change) => change.type === "remove").length,
    replaced: patch.changes.filter((change) => change.type === "replace").length
  };
}

export function executeVoxelTools(
  structure: VoxelStructure,
  calls: VoxelToolCall[],
  options: { bounds?: SceneBounds; writableBounds?: Box3D; regions?: SemanticRegion[]; budgets?: Partial<VoxelToolBudgets> } = {}
): VoxelToolExecution {
  const bounds = options.bounds ?? { width: 64, depth: 64, maxHeight: 64 };
  if (bounds.width !== 64 || bounds.depth !== 64 || !Number.isInteger(bounds.maxHeight) || bounds.maxHeight < 1 || bounds.maxHeight > 64) throw new VoxelToolError("Scene bounds must be 64×64 with a height from 1 to 64.");
  const budgets = { ...DEFAULT_TOOL_BUDGETS, ...options.budgets };
  const safeCalls = validateVoxelToolCalls(calls);
  if (safeCalls.length > budgets.maxCalls) throw new VoxelToolError(`Tool plan exceeds the ${budgets.maxCalls} call budget.`);
  const locked = (options.regions ?? []).filter((region) => region.locked);
  const base = normalizeStructure(structure);
  const map: BlockMap = new Map(base.blocks.map((block) => [coordinateKey(block), { ...block }]));
  const reports: VoxelToolReport[] = [];
  let totalVisited = 0;

  const isLocked = (point: Position) => locked.some((region) => contains(region.bounds, point));
  const visit = (point: Position) => {
    totalVisited += 1;
    if (totalVisited > budgets.maxCoordinates) throw new VoxelToolError(`Tool plan exceeds the ${budgets.maxCoordinates.toLocaleString()} coordinate budget.`);
    assertSceneBounds(point, bounds);
    if (options.writableBounds && !contains(options.writableBounds, point)) throw new VoxelToolError(`Coordinate ${point.join(",")} is outside the writable selection.`);
  };
  const write = (point: Position, block: VoxelBlock | undefined, writeMode: ToolWriteMode = "overwrite") => {
    const key = point.join(",");
    const existing = map.get(key);
    if (writeMode === "empty" && existing) return false;
    if ((!existing && !block) || (existing && block && existing.id === block.id && existing.ownerId === block.ownerId)) return false;
    if (isLocked(point)) throw new VoxelToolError(`Tool plan would modify locked coordinate ${key}.`);
    if (block) map.set(key, { ...block }); else map.delete(key);
    return true;
  };

  for (const call of safeCalls) {
    const before = normalizeStructure({ ...base, blocks: Array.from(map.values()) });
    let skipped = 0;
    let visited = 0;
    const process = (point: Position, block: VoxelBlock | undefined, writeMode?: ToolWriteMode) => {
      visit(point); visited += 1;
      if (!write(point, block, writeMode)) skipped += 1;
    };
    if (call.type === "fill" || call.type === "remove" || call.type === "replace") {
      for (const point of coordinates(orderedBox(call.from, call.to))) {
        const current = map.get(point.join(","));
        if (call.type === "fill") process(point, { x: point[0], y: point[1], z: point[2], id: call.material, ...(call.ownerId ? { ownerId: call.ownerId } : {}) }, call.mode);
        else if (call.type === "remove") process(point, undefined);
        else {
          visit(point); visited += 1;
          if (!current || current.id !== call.fromMaterial) skipped += 1;
          else if (!write(point, { ...current, id: call.toMaterial, ...(call.ownerId ? { ownerId: call.ownerId } : {}) })) skipped += 1;
        }
      }
    } else if (call.type === "line") {
      for (const point of lineCoordinates(call.from, call.to)) process(point, { x: point[0], y: point[1], z: point[2], id: call.material, ...(call.ownerId ? { ownerId: call.ownerId } : {}) }, call.mode);
    } else {
      assertSceneBounds([call.source.minX, call.source.minY, call.source.minZ], bounds);
      assertSceneBounds([call.source.maxX, call.source.maxY, call.source.maxZ], bounds);
      const sourceBlocks = Array.from(map.values()).filter((block) => contains(call.source, [block.x, block.y, block.z])).map((block) => ({ ...block }));
      for (const block of sourceBlocks) {
        const point: Position = call.type === "copy"
          ? [block.x + call.offset[0], block.y + call.offset[1], block.z + call.offset[2]]
          : call.axis === "x" ? [2 * call.pivot - block.x, block.y, block.z] : [block.x, block.y, 2 * call.pivot - block.z];
        process(point, { ...block, x: point[0], y: point[1], z: point[2], ...(call.ownerId ? { ownerId: call.ownerId } : {}) }, call.mode);
      }
    }
    const after = normalizeStructure({ ...base, blocks: Array.from(map.values()) });
    const counts = countPatch(diffStructures(before, after));
    reports.push({ type: call.type, ...counts, skipped, visited });
  }
  const result = normalizeStructure({ ...base, blocks: Array.from(map.values()) });
  const patch = diffStructures(base, result);
  if (patch.changes.length > budgets.maxChangedBlocks) throw new VoxelToolError(`Final tool plan exceeds the ${budgets.maxChangedBlocks.toLocaleString()} unique changed-block budget.`);
  if (!patch.changes.length) throw new VoxelToolError("The tool plan does not change the structure.");
  return { structure: result, patch, reports };
}

export function createVoxelToolPendingEdit(prompt: string, execution: VoxelToolExecution, calls: VoxelToolCall[]): PendingEdit {
  return { prompt, operations: [], toolCalls: calls, patch: execution.patch, preview: execution.structure };
}
