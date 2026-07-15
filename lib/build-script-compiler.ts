import { validateBuildScript, DEFAULT_BUILD_SCRIPT_BUDGETS } from "./build-script";
import { validateBuildScriptStructure } from "./build-script-structure-validator";
import { executeVoxelTools, VoxelToolError } from "./voxel-tools";
import type { BuildScript, BuildScriptBudgets, BuildScriptOperation } from "./build-script";
import type { BlockId, Box3D, Position, VoxelStructure, VoxelToolCall } from "./structure";
import type { VoxelToolReport } from "./voxel-tools";
import type { BuildScriptStructureReport } from "./build-script-structure-validator";

export const BUILD_SCRIPT_COMPILER_VERSION = "1.0.0";

export type BuildScriptOperationReport = {
  operationId: string;
  type: BuildScriptOperation["type"];
  toolCalls: number;
  added: number;
  removed: number;
  replaced: number;
  skipped: number;
  visited: number;
};

export type BuildScriptCompilation = {
  script: BuildScript;
  structure: VoxelStructure;
  toolCalls: VoxelToolCall[];
  reports: BuildScriptOperationReport[];
  validation: BuildScriptStructureReport;
  stats: {
    operationCount: number;
    toolCallCount: number;
    blockCount: number;
    visitedCoordinates: number;
  };
};

type CompiledCall = {
  operationId: string;
  operationType: BuildScriptOperation["type"];
  call: VoxelToolCall;
};

type Component = {
  bounds: Box3D;
  type: BuildScriptOperation["type"];
  wallMaterial?: BlockId;
  targetId?: string;
  side?: "front" | "back" | "left" | "right";
  openings: Box3D[];
};

export class BuildScriptCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildScriptCompileError";
  }
}

function boundsFromOrigin(origin: Position, size: Position): Box3D {
  return {
    minX: origin[0], minY: origin[1], minZ: origin[2],
    maxX: origin[0] + size[0] - 1,
    maxY: origin[1] + size[1] - 1,
    maxZ: origin[2] + size[2] - 1
  };
}

function fill(from: Position, to: Position, material: BlockId, ownerId: string): VoxelToolCall {
  return { type: "fill", from, to, material, ownerId };
}

function boxesIntersect(a: Box3D, b: Box3D) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function centeredRange(bounds: Box3D, side: "front" | "back" | "left" | "right", width: number, offset = 0) {
  const minimum = side === "front" || side === "back" ? bounds.minX + 1 : bounds.minZ + 1;
  const maximum = side === "front" || side === "back" ? bounds.maxX - 1 : bounds.maxZ - 1;
  const start = Math.floor((minimum + maximum - width + 1) / 2) + offset;
  return { start, end: start + width - 1, minimum, maximum };
}

function facadeBox(bounds: Box3D, side: "front" | "back" | "left" | "right", start: number, end: number, minY: number, maxY: number): Box3D {
  if (side === "front") return { minX: start, maxX: end, minY, maxY, minZ: bounds.minZ, maxZ: bounds.minZ };
  if (side === "back") return { minX: start, maxX: end, minY, maxY, minZ: bounds.maxZ, maxZ: bounds.maxZ };
  if (side === "left") return { minX: bounds.minX, maxX: bounds.minX, minY, maxY, minZ: start, maxZ: end };
  return { minX: bounds.maxX, maxX: bounds.maxX, minY, maxY, minZ: start, maxZ: end };
}

function exteriorBounds(bounds: Box3D, side: "front" | "back" | "left" | "right", width: number, depth: number): Box3D {
  const { start, end } = centeredRange(bounds, side, width);
  if (side === "front") return { minX: start, maxX: end, minY: bounds.minY, maxY: bounds.minY, minZ: bounds.minZ - depth, maxZ: bounds.minZ - 1 };
  if (side === "back") return { minX: start, maxX: end, minY: bounds.minY, maxY: bounds.minY, minZ: bounds.maxZ + 1, maxZ: bounds.maxZ + depth };
  if (side === "left") return { minX: bounds.minX - depth, maxX: bounds.minX - 1, minY: bounds.minY, maxY: bounds.minY, minZ: start, maxZ: end };
  return { minX: bounds.maxX + 1, maxX: bounds.maxX + depth, minY: bounds.minY, maxY: bounds.minY, minZ: start, maxZ: end };
}

function boxFill(bounds: Box3D, material: BlockId, ownerId: string): VoxelToolCall {
  return fill([bounds.minX, bounds.minY, bounds.minZ], [bounds.maxX, bounds.maxY, bounds.maxZ], material, ownerId);
}

function operationCalls(operation: BuildScriptOperation, components: Map<string, Component>): VoxelToolCall[] {
  if (operation.type === "foundation") {
    const bounds = boundsFromOrigin(operation.origin, operation.size);
    components.set(operation.id, { bounds, type: operation.type, openings: [] });
    return [fill(
      [bounds.minX, bounds.minY, bounds.minZ],
      [bounds.maxX, bounds.maxY, bounds.maxZ],
      operation.material as BlockId,
      operation.id
    )];
  }

  if (operation.type === "hollowBox") {
    const bounds = boundsFromOrigin(operation.origin, operation.size);
    components.set(operation.id, { bounds, type: operation.type, wallMaterial: operation.wall as BlockId, openings: [] });
    const calls: VoxelToolCall[] = [];
    const wallMinY = operation.floor ? bounds.minY + 1 : bounds.minY;
    if (operation.floor) {
      calls.push(fill(
        [bounds.minX, bounds.minY, bounds.minZ],
        [bounds.maxX, bounds.minY, bounds.maxZ],
        operation.floor as BlockId,
        operation.id
      ));
    }
    calls.push(
      fill([bounds.minX, wallMinY, bounds.minZ], [bounds.minX, bounds.maxY, bounds.maxZ], operation.wall as BlockId, operation.id),
      fill([bounds.maxX, wallMinY, bounds.minZ], [bounds.maxX, bounds.maxY, bounds.maxZ], operation.wall as BlockId, operation.id),
      fill([bounds.minX + 1, wallMinY, bounds.minZ], [bounds.maxX - 1, bounds.maxY, bounds.minZ], operation.wall as BlockId, operation.id),
      fill([bounds.minX + 1, wallMinY, bounds.maxZ], [bounds.maxX - 1, bounds.maxY, bounds.maxZ], operation.wall as BlockId, operation.id)
    );
    return calls;
  }

  if (operation.type === "cylinder") {
    const [centerX, minY, centerZ] = operation.origin;
    const maxY = minY + operation.height - 1;
    const radius = operation.radius;
    const material = operation.material as BlockId;
    const bounds = { minX: centerX - radius, maxX: centerX + radius, minY, maxY, minZ: centerZ - radius, maxZ: centerZ + radius };
    components.set(operation.id, { bounds, type: operation.type, openings: [] });
    const calls: VoxelToolCall[] = [];
    for (let dz = -radius; dz <= radius; dz += 1) {
      const halfWidth = Math.floor(Math.sqrt(radius * radius - dz * dz));
      if (operation.hollow) {
        calls.push(fill([centerX - halfWidth, minY, centerZ + dz], [centerX - halfWidth, maxY, centerZ + dz], material, operation.id));
        if (halfWidth) calls.push(fill([centerX + halfWidth, minY, centerZ + dz], [centerX + halfWidth, maxY, centerZ + dz], material, operation.id));
        calls.push(fill([centerX - halfWidth, minY, centerZ + dz], [centerX + halfWidth, minY, centerZ + dz], material, operation.id));
      } else {
        calls.push(fill([centerX - halfWidth, minY, centerZ + dz], [centerX + halfWidth, maxY, centerZ + dz], material, operation.id));
      }
    }
    return calls;
  }

  const target = components.get(operation.target);
  if (!target) throw new BuildScriptCompileError(`Missing validated target \"${operation.target}\".`);

  if (operation.type === "entrance") {
    const selectedSide = operation.side ?? "front";
    const range = centeredRange(target.bounds, selectedSide, operation.width ?? 2, operation.offset ?? 0);
    const opening = facadeBox(target.bounds, selectedSide, range.start, range.end, target.bounds.minY + 1, target.bounds.minY + (operation.height ?? 3));
    target.openings.push(opening);
    components.set(operation.id, { bounds: opening, type: operation.type, targetId: operation.target, side: selectedSide, openings: [] });
    return [{ type: "remove", from: [opening.minX, opening.minY, opening.minZ], to: [opening.maxX, opening.maxY, opening.maxZ] }];
  }

  if (operation.type === "windows") {
    if (!target.wallMaterial) throw new BuildScriptCompileError(`Window target \"${operation.target}\" has no wall material.`);
    const sides = operation.side === "all" ? ["front", "back", "left", "right"] as const : [operation.side ?? "front"] as const;
    const windowWidth = operation.width ?? 1;
    const windowHeight = operation.height ?? 2;
    const sillHeight = operation.sillHeight ?? 2;
    const calls: VoxelToolCall[] = [];
    const windowBounds: Box3D[] = [];
    for (const selectedSide of sides) {
      const range = centeredRange(target.bounds, selectedSide, windowWidth);
      const starts: number[] = [];
      for (let start = range.minimum; start + windowWidth - 1 <= range.maximum; start += 1) {
        const candidate = facadeBox(target.bounds, selectedSide, start, start + windowWidth - 1, target.bounds.minY + sillHeight, target.bounds.minY + sillHeight + windowHeight - 1);
        if (!target.openings.some((opening) => boxesIntersect(opening, candidate))) starts.push(start);
      }
      const wanted = Math.min(operation.count, starts.length);
      const selectedStarts = new Set<number>();
      for (let index = 0; index < wanted; index += 1) {
        selectedStarts.add(starts[Math.floor(((index + 1) * starts.length) / (wanted + 1))]);
      }
      for (const start of selectedStarts) {
        const window = facadeBox(target.bounds, selectedSide, start, start + windowWidth - 1, target.bounds.minY + sillHeight, target.bounds.minY + sillHeight + windowHeight - 1);
        windowBounds.push(window);
        target.openings.push(window);
        calls.push({
          type: "replace",
          from: [window.minX, window.minY, window.minZ],
          to: [window.maxX, window.maxY, window.maxZ],
          fromMaterial: target.wallMaterial,
          toMaterial: operation.material as BlockId,
          ownerId: operation.id
        });
      }
    }
    if (!calls.length) throw new BuildScriptCompileError(`No safe window positions remain on target \"${operation.target}\".`);
    const bounds = windowBounds.reduce<Box3D>((combined, window) => ({
      minX: Math.min(combined.minX, window.minX), maxX: Math.max(combined.maxX, window.maxX),
      minY: Math.min(combined.minY, window.minY), maxY: Math.max(combined.maxY, window.maxY),
      minZ: Math.min(combined.minZ, window.minZ), maxZ: Math.max(combined.maxZ, window.maxZ)
    }), { ...windowBounds[0] });
    components.set(operation.id, { bounds, type: operation.type, targetId: operation.target, openings: [] });
    return calls;
  }

  if (operation.type === "porch") {
    const selectedSide = operation.side ?? "front";
    const bounds = exteriorBounds(target.bounds, selectedSide, operation.width, operation.depth);
    components.set(operation.id, { bounds, type: operation.type, targetId: operation.target, side: selectedSide, openings: [] });
    return [boxFill(bounds, operation.material as BlockId, operation.id)];
  }

  if (operation.type === "path") {
    if (target.type !== "entrance" || !target.side) throw new BuildScriptCompileError(`Path target \"${operation.target}\" is not an entrance.`);
    const centerX = Math.floor((target.bounds.minX + target.bounds.maxX) / 2);
    const centerZ = Math.floor((target.bounds.minZ + target.bounds.maxZ) / 2);
    const half = Math.floor(operation.width / 2);
    let bounds: Box3D;
    if (target.side === "front") bounds = { minX: centerX - half, maxX: centerX - half + operation.width - 1, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: target.bounds.minZ - operation.length, maxZ: target.bounds.minZ - 1 };
    else if (target.side === "back") bounds = { minX: centerX - half, maxX: centerX - half + operation.width - 1, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: target.bounds.maxZ + 1, maxZ: target.bounds.maxZ + operation.length };
    else if (target.side === "left") bounds = { minX: target.bounds.minX - operation.length, maxX: target.bounds.minX - 1, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: centerZ - half, maxZ: centerZ - half + operation.width - 1 };
    else bounds = { minX: target.bounds.maxX + 1, maxX: target.bounds.maxX + operation.length, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: centerZ - half, maxZ: centerZ - half + operation.width - 1 };
    components.set(operation.id, { bounds, type: operation.type, targetId: operation.target, side: target.side, openings: [] });
    return [boxFill(bounds, operation.material as BlockId, operation.id)];
  }

  if (operation.type === "copyMirror") {
    let bounds: Box3D;
    let call: VoxelToolCall;
    if (operation.mode === "copy") {
      const offset = operation.offset ?? [0, 0, 0];
      bounds = { minX: target.bounds.minX + offset[0], maxX: target.bounds.maxX + offset[0], minY: target.bounds.minY + offset[1], maxY: target.bounds.maxY + offset[1], minZ: target.bounds.minZ + offset[2], maxZ: target.bounds.maxZ + offset[2] };
      call = { type: "copy", source: target.bounds, offset };
    } else {
      const pivot = operation.pivot ?? 0;
      const axis = operation.axis ?? "x";
      bounds = axis === "x"
        ? { ...target.bounds, minX: 2 * pivot - target.bounds.maxX, maxX: 2 * pivot - target.bounds.minX }
        : { ...target.bounds, minZ: 2 * pivot - target.bounds.maxZ, maxZ: 2 * pivot - target.bounds.minZ };
      call = { type: "mirror", source: target.bounds, axis, pivot };
    }
    components.set(operation.id, { bounds, type: operation.type, openings: [] });
    return [call];
  }

  const overhang = operation.overhang ?? 0;
  const roofMinX = target.bounds.minX - overhang;
  const roofMaxX = target.bounds.maxX + overhang;
  const roofMinZ = target.bounds.minZ - overhang;
  const roofMaxZ = target.bounds.maxZ + overhang;
  const roofMinY = target.bounds.maxY + 1;

  if (operation.type === "flatRoof") {
    const thickness = operation.thickness ?? 1;
    components.set(operation.id, {
      bounds: { minX: roofMinX, minY: roofMinY, minZ: roofMinZ, maxX: roofMaxX, maxY: roofMinY + thickness - 1, maxZ: roofMaxZ },
      type: operation.type,
      targetId: operation.target,
      openings: []
    });
    return [fill(
      [roofMinX, roofMinY, roofMinZ],
      [roofMaxX, roofMinY + thickness - 1, roofMaxZ],
      operation.material as BlockId,
      operation.id
    )];
  }

  const height = operation.height;
  const ridgeAxis = operation.ridgeAxis ?? "x";
  const slopeMin = ridgeAxis === "x" ? roofMinZ : roofMinX;
  const slopeMax = ridgeAxis === "x" ? roofMaxZ : roofMaxX;
  const slopeWidth = slopeMax - slopeMin + 1;
  const leftWidth = Math.ceil(slopeWidth / 2);
  const rightWidth = Math.floor(slopeWidth / 2);
  const calls: VoxelToolCall[] = [];

  const addBand = (start: number, end: number, y: number) => {
    if (start > end) return;
    calls.push(ridgeAxis === "x"
      ? fill([roofMinX, y, start], [roofMaxX, y, end], operation.material as BlockId, operation.id)
      : fill([start, y, roofMinZ], [end, y, roofMaxZ], operation.material as BlockId, operation.id));
  };

  for (let level = 0; level < height; level += 1) {
    const leftStart = slopeMin + Math.max(0, Math.floor((level * leftWidth) / height) - (level > 0 ? 1 : 0));
    const leftEnd = level === 0
      ? Math.max(slopeMin + Math.ceil(leftWidth / height) - 1, slopeMin + overhang)
      : slopeMin + Math.ceil(((level + 1) * leftWidth) / height) - 1;
    addBand(leftStart, leftEnd, roofMinY + level);

    const rightEnd = slopeMax - Math.max(0, Math.floor((level * rightWidth) / height) - (level > 0 ? 1 : 0));
    const rightStart = level === 0
      ? Math.min(slopeMax - Math.ceil(rightWidth / height) + 1, slopeMax - overhang)
      : slopeMax - Math.ceil(((level + 1) * rightWidth) / height) + 1;
    addBand(rightStart, rightEnd, roofMinY + level);
  }

  components.set(operation.id, {
    bounds: { minX: roofMinX, minY: roofMinY, minZ: roofMinZ, maxX: roofMaxX, maxY: roofMinY + height - 1, maxZ: roofMaxZ },
    type: operation.type,
    targetId: operation.target,
    openings: []
  });
  return calls;
}

function combineReport(
  operation: BuildScriptOperation,
  reports: VoxelToolReport[]
): BuildScriptOperationReport {
  return reports.reduce<BuildScriptOperationReport>((total, report) => ({
    ...total,
    added: total.added + report.added,
    removed: total.removed + report.removed,
    replaced: total.replaced + report.replaced,
    skipped: total.skipped + report.skipped,
    visited: total.visited + report.visited
  }), {
    operationId: operation.id,
    type: operation.type,
    toolCalls: reports.length,
    added: 0,
    removed: 0,
    replaced: 0,
    skipped: 0,
    visited: 0
  });
}

export function compileBuildScript(
  value: unknown,
  budgetOverrides: Partial<BuildScriptBudgets> = {}
): BuildScriptCompilation {
  const budgets = { ...DEFAULT_BUILD_SCRIPT_BUDGETS, ...budgetOverrides };
  const script = validateBuildScript(value, budgets);
  const components = new Map<string, Component>();
  const compiled: CompiledCall[] = [];

  for (const operation of script.operations) {
    for (const call of operationCalls(operation, components)) {
      compiled.push({ operationId: operation.id, operationType: operation.type, call });
    }
  }
  if (compiled.length > budgets.maxToolCalls) {
    throw new BuildScriptCompileError(`Compiled script exceeds the ${budgets.maxToolCalls} tool-call budget.`);
  }

  try {
    const execution = executeVoxelTools(
      { name: script.name, size: [0, 0, 0], blocks: [] },
      compiled.map((item) => item.call),
      {
        bounds: script.bounds,
        budgets: {
          maxCalls: budgets.maxToolCalls,
          maxCoordinates: budgets.maxCoordinates,
          maxChangedBlocks: budgets.maxChangedBlocks
        }
      }
    );
    let reportIndex = 0;
    const reports = script.operations.map((operation) => {
      const callCount = compiled.filter((item) => item.operationId === operation.id).length;
      const operationReports = execution.reports.slice(reportIndex, reportIndex + callCount);
      reportIndex += callCount;
      return combineReport(operation, operationReports);
    });
    return {
      script,
      structure: execution.structure,
      toolCalls: compiled.map((item) => item.call),
      reports,
      validation: validateBuildScriptStructure(script, execution.structure),
      stats: {
        operationCount: script.operations.length,
        toolCallCount: compiled.length,
        blockCount: execution.structure.blocks.length,
        visitedCoordinates: reports.reduce((sum, report) => sum + report.visited, 0)
      }
    };
  } catch (error) {
    if (error instanceof VoxelToolError) throw new BuildScriptCompileError(error.message);
    throw error;
  }
}
