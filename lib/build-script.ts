import { isBlockId, MAX_STRUCTURE_BLOCKS, MAX_VISITED_COORDINATES, SCENE_MAX_COORDINATE, SCENE_SIZE } from "./structure";
import type { BlockId, Box3D, Position } from "./structure";

export type BuildScriptBounds = {
  width: typeof SCENE_SIZE;
  depth: typeof SCENE_SIZE;
  maxHeight: typeof SCENE_SIZE;
};

export type BuildScriptMaterial = string;
export type BuildScriptSide = "front" | "back" | "left" | "right";

export type FoundationOperation = {
  type: "foundation";
  id: string;
  origin: Position;
  size: Position;
  material: BuildScriptMaterial;
};

export type HollowBoxOperation = {
  type: "hollowBox";
  id: string;
  origin: Position;
  size: Position;
  wall: BuildScriptMaterial;
  floor?: BuildScriptMaterial;
};

export type CylinderOperation = {
  type: "cylinder";
  id: string;
  origin: Position;
  radius: number;
  height: number;
  material: BuildScriptMaterial;
  hollow?: boolean;
};

export type GableRoofOperation = {
  type: "gableRoof";
  id: string;
  target: string;
  height: number;
  overhang?: number;
  material: BuildScriptMaterial;
  ridgeAxis?: "x" | "z";
};

export type FlatRoofOperation = {
  type: "flatRoof";
  id: string;
  target: string;
  overhang?: number;
  thickness?: number;
  material: BuildScriptMaterial;
};

export type EntranceOperation = {
  type: "entrance";
  id: string;
  target: string;
  side?: BuildScriptSide;
  width?: number;
  height?: number;
  offset?: number;
};

export type WindowsOperation = {
  type: "windows";
  id: string;
  target: string;
  side?: BuildScriptSide | "all";
  count: number;
  width?: number;
  height?: number;
  sillHeight?: number;
  material: BuildScriptMaterial;
};

export type PorchOperation = {
  type: "porch";
  id: string;
  target: string;
  side?: BuildScriptSide;
  width: number;
  depth: number;
  material: BuildScriptMaterial;
};

export type PathOperation = {
  type: "path";
  id: string;
  target: string;
  length: number;
  width: number;
  material: BuildScriptMaterial;
};

export type CopyMirrorOperation = {
  type: "copyMirror";
  id: string;
  target: string;
  mode: "copy" | "mirror";
  offset?: Position;
  axis?: "x" | "z";
  pivot?: number;
};

export type BuildScriptOperation =
  | FoundationOperation
  | HollowBoxOperation
  | CylinderOperation
  | GableRoofOperation
  | FlatRoofOperation
  | EntranceOperation
  | WindowsOperation
  | PorchOperation
  | PathOperation
  | CopyMirrorOperation;

export type BuildScript = {
  version: 1;
  name: string;
  bounds: BuildScriptBounds;
  palette: Record<string, BlockId>;
  operations: BuildScriptOperation[];
};

export type BuildScriptBudgets = {
  maxOperations: number;
  maxToolCalls: number;
  maxCoordinates: number;
  maxChangedBlocks: number;
};

export const DEFAULT_BUILD_SCRIPT_BUDGETS: BuildScriptBudgets = {
  maxOperations: 64,
  maxToolCalls: 512,
  maxCoordinates: MAX_VISITED_COORDINATES,
  maxChangedBlocks: MAX_STRUCTURE_BLOCKS
};

export class BuildScriptValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join("\n"));
    this.name = "BuildScriptValidationError";
    this.issues = [...issues];
  }
}

type Component = {
  id: string;
  type: BuildScriptOperation["type"];
  bounds: Box3D;
  targetId?: string;
  side?: BuildScriptSide;
};

type ValidationContext = {
  palette: Record<string, BlockId>;
  components: Map<string, Component>;
  bounds: BuildScriptBounds;
};

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const PALETTE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/i;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BuildScriptValidationError([`${field} must be an object.`]);
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new BuildScriptValidationError([`${field} must be an integer from ${minimum} to ${maximum}.`]);
  }
  return value as number;
}

function position(value: unknown, field: string, minimums: Position): Position {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new BuildScriptValidationError([`${field} must contain exactly x, y, and z.`]);
  }
  return [
    integer(value[0], `${field}[0]`, minimums[0], SCENE_SIZE),
    integer(value[1], `${field}[1]`, minimums[1], SCENE_SIZE),
    integer(value[2], `${field}[2]`, minimums[2], SCENE_SIZE)
  ];
}

function signedPosition(value: unknown, field: string): Position {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new BuildScriptValidationError([`${field} must contain exactly x, y, and z.`]);
  }
  return [
    integer(value[0], `${field}[0]`, -SCENE_MAX_COORDINATE, SCENE_MAX_COORDINATE),
    integer(value[1], `${field}[1]`, -SCENE_MAX_COORDINATE, SCENE_MAX_COORDINATE),
    integer(value[2], `${field}[2]`, -SCENE_MAX_COORDINATE, SCENE_MAX_COORDINATE)
  ];
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new BuildScriptValidationError([`${field} must be a 1-64 character identifier.`]);
  }
  return value;
}

function material(value: unknown, field: string, palette: Record<string, BlockId>): BlockId {
  if (typeof value !== "string") {
    throw new BuildScriptValidationError([`${field} must be a palette key or supported Minecraft block ID.`]);
  }
  if (isBlockId(value)) return value;
  const resolved = palette[value];
  if (!resolved) throw new BuildScriptValidationError([`${field} references unknown material \"${value}\".`]);
  return resolved;
}

function assertInsideScene(bounds: Box3D, scene: BuildScriptBounds, field: string) {
  if (
    bounds.minX < 0 || bounds.minY < 0 || bounds.minZ < 0 ||
    bounds.maxX >= scene.width || bounds.maxY >= scene.maxHeight || bounds.maxZ >= scene.depth
  ) {
    throw new BuildScriptValidationError([
      `${field} extends outside the ${scene.width}x${scene.depth}x${scene.maxHeight} scene.`
    ]);
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

function roofBounds(target: Box3D, overhang: number, height: number): Box3D {
  return {
    minX: target.minX - overhang,
    minY: target.maxY + 1,
    minZ: target.minZ - overhang,
    maxX: target.maxX + overhang,
    maxY: target.maxY + height,
    maxZ: target.maxZ + overhang
  };
}

function validatePalette(value: unknown): Record<string, BlockId> {
  const raw = record(value, "palette");
  const entries = Object.entries(raw);
  if (!entries.length || entries.length > 32) {
    throw new BuildScriptValidationError(["palette must contain from 1 to 32 materials."]);
  }
  const palette: Record<string, BlockId> = {};
  for (const [key, value] of entries) {
    if (!PALETTE_KEY_PATTERN.test(key)) {
      throw new BuildScriptValidationError([`palette key \"${key}\" is invalid.`]);
    }
    if (typeof value !== "string" || !isBlockId(value)) {
      throw new BuildScriptValidationError([`palette.${key} is not a supported Minecraft block ID.`]);
    }
    palette[key] = value;
  }
  return palette;
}

function targetComponent(value: unknown, field: string, context: ValidationContext): Component {
  const target = identifier(value, field);
  const component = context.components.get(target);
  if (!component) throw new BuildScriptValidationError([`${field} references missing or later component \"${target}\".`]);
  if (component.type !== "hollowBox") {
    throw new BuildScriptValidationError([`${field} must reference a hollowBox component.`]);
  }
  return component;
}

function anyTargetComponent(value: unknown, field: string, context: ValidationContext): Component {
  const target = identifier(value, field);
  const component = context.components.get(target);
  if (!component) throw new BuildScriptValidationError([`${field} references missing or later component "${target}".`]);
  return component;
}

function side(value: unknown, field: string, fallback: BuildScriptSide = "front"): BuildScriptSide {
  const result = value === undefined ? fallback : value;
  if (result !== "front" && result !== "back" && result !== "left" && result !== "right") {
    throw new BuildScriptValidationError([`${field} must be front, back, left, or right.`]);
  }
  return result;
}

function sideSpan(bounds: Box3D, selectedSide: BuildScriptSide) {
  return selectedSide === "front" || selectedSide === "back"
    ? { minimum: bounds.minX + 1, maximum: bounds.maxX - 1 }
    : { minimum: bounds.minZ + 1, maximum: bounds.maxZ - 1 };
}

function centeredRange(bounds: Box3D, selectedSide: BuildScriptSide, width: number, offset: number) {
  const span = sideSpan(bounds, selectedSide);
  const start = Math.floor((span.minimum + span.maximum - width + 1) / 2) + offset;
  return { start, end: start + width - 1, span };
}

function facadeBox(bounds: Box3D, selectedSide: BuildScriptSide, start: number, end: number, minY: number, maxY: number): Box3D {
  if (selectedSide === "front") return { minX: start, maxX: end, minY, maxY, minZ: bounds.minZ, maxZ: bounds.minZ };
  if (selectedSide === "back") return { minX: start, maxX: end, minY, maxY, minZ: bounds.maxZ, maxZ: bounds.maxZ };
  if (selectedSide === "left") return { minX: bounds.minX, maxX: bounds.minX, minY, maxY, minZ: start, maxZ: end };
  return { minX: bounds.maxX, maxX: bounds.maxX, minY, maxY, minZ: start, maxZ: end };
}

function exteriorBox(bounds: Box3D, selectedSide: BuildScriptSide, width: number, depth: number): Box3D {
  const { start, end } = centeredRange(bounds, selectedSide, width, 0);
  if (selectedSide === "front") return { minX: start, maxX: end, minY: bounds.minY, maxY: bounds.minY, minZ: bounds.minZ - depth, maxZ: bounds.minZ - 1 };
  if (selectedSide === "back") return { minX: start, maxX: end, minY: bounds.minY, maxY: bounds.minY, minZ: bounds.maxZ + 1, maxZ: bounds.maxZ + depth };
  if (selectedSide === "left") return { minX: bounds.minX - depth, maxX: bounds.minX - 1, minY: bounds.minY, maxY: bounds.minY, minZ: start, maxZ: end };
  return { minX: bounds.maxX + 1, maxX: bounds.maxX + depth, minY: bounds.minY, maxY: bounds.minY, minZ: start, maxZ: end };
}

function transformedBounds(source: Box3D, operation: CopyMirrorOperation): Box3D {
  if (operation.mode === "copy") {
    const [x, y, z] = operation.offset ?? [0, 0, 0];
    return { minX: source.minX + x, maxX: source.maxX + x, minY: source.minY + y, maxY: source.maxY + y, minZ: source.minZ + z, maxZ: source.maxZ + z };
  }
  const pivot = operation.pivot ?? 0;
  return operation.axis === "x"
    ? { ...source, minX: 2 * pivot - source.maxX, maxX: 2 * pivot - source.minX }
    : { ...source, minZ: 2 * pivot - source.maxZ, maxZ: 2 * pivot - source.minZ };
}

function validateOperation(value: unknown, index: number, context: ValidationContext): BuildScriptOperation {
  const raw = record(value, `operations[${index}]`);
  const id = identifier(raw.id, `operations[${index}].id`);
  if (context.components.has(id)) {
    throw new BuildScriptValidationError([`operations[${index}].id duplicates component \"${id}\".`]);
  }
  const field = (name: string) => `operations[${index}].${name}`;
  let operation: BuildScriptOperation;
  let componentBounds: Box3D;

  if (raw.type === "foundation") {
    const origin = position(raw.origin, field("origin"), [0, 0, 0]);
    const size = position(raw.size, field("size"), [1, 1, 1]);
    componentBounds = boundsFromOrigin(origin, size);
    operation = { type: raw.type, id, origin, size, material: material(raw.material, field("material"), context.palette) };
  } else if (raw.type === "hollowBox") {
    const origin = position(raw.origin, field("origin"), [0, 0, 0]);
    const size = position(raw.size, field("size"), [3, 2, 3]);
    componentBounds = boundsFromOrigin(origin, size);
    operation = {
      type: raw.type,
      id,
      origin,
      size,
      wall: material(raw.wall, field("wall"), context.palette),
      ...(raw.floor === undefined ? {} : { floor: material(raw.floor, field("floor"), context.palette) })
    };
  } else if (raw.type === "cylinder") {
    const origin = position(raw.origin, field("origin"), [0, 0, 0]);
    const radius = integer(raw.radius, field("radius"), 1, 32);
    const height = integer(raw.height, field("height"), 1, SCENE_SIZE);
    if (raw.hollow !== undefined && typeof raw.hollow !== "boolean") {
      throw new BuildScriptValidationError([`${field("hollow")} must be a boolean.`]);
    }
    componentBounds = {
      minX: origin[0] - radius,
      maxX: origin[0] + radius,
      minY: origin[1],
      maxY: origin[1] + height - 1,
      minZ: origin[2] - radius,
      maxZ: origin[2] + radius
    };
    operation = {
      type: raw.type,
      id,
      origin,
      radius,
      height,
      material: material(raw.material, field("material"), context.palette),
      ...(raw.hollow === undefined ? {} : { hollow: raw.hollow })
    };
  } else if (raw.type === "gableRoof") {
    const target = targetComponent(raw.target, field("target"), context);
    const height = integer(raw.height, field("height"), 1, 64);
    const overhang = raw.overhang === undefined ? 0 : integer(raw.overhang, field("overhang"), 0, 16);
    const ridgeAxis = raw.ridgeAxis === undefined
      ? target.bounds.maxX - target.bounds.minX >= target.bounds.maxZ - target.bounds.minZ ? "x" : "z"
      : raw.ridgeAxis;
    if (ridgeAxis !== "x" && ridgeAxis !== "z") {
      throw new BuildScriptValidationError([`${field("ridgeAxis")} must be x or z.`]);
    }
    componentBounds = roofBounds(target.bounds, overhang, height);
    operation = {
      type: raw.type,
      id,
      target: target.id,
      height,
      overhang,
      material: material(raw.material, field("material"), context.palette),
      ridgeAxis
    };
  } else if (raw.type === "flatRoof") {
    const target = targetComponent(raw.target, field("target"), context);
    const overhang = raw.overhang === undefined ? 0 : integer(raw.overhang, field("overhang"), 0, 16);
    const thickness = raw.thickness === undefined ? 1 : integer(raw.thickness, field("thickness"), 1, 8);
    componentBounds = roofBounds(target.bounds, overhang, thickness);
    operation = {
      type: raw.type,
      id,
      target: target.id,
      overhang,
      thickness,
      material: material(raw.material, field("material"), context.palette)
    };
  } else if (raw.type === "entrance") {
    const target = targetComponent(raw.target, field("target"), context);
    const selectedSide = side(raw.side, field("side"));
    const width = raw.width === undefined ? 2 : integer(raw.width, field("width"), 1, 8);
    const height = raw.height === undefined ? 3 : integer(raw.height, field("height"), 2, 10);
    const offset = raw.offset === undefined ? 0 : integer(raw.offset, field("offset"), -32, 32);
    if (target.bounds.minY + height >= target.bounds.maxY) {
      throw new BuildScriptValidationError([`${field("height")} must leave at least one wall block above the entrance.`]);
    }
    const range = centeredRange(target.bounds, selectedSide, width, offset);
    if (range.start < range.span.minimum || range.end > range.span.maximum) {
      const centeredStart = range.start - offset;
      const minimumOffset = range.span.minimum - centeredStart;
      const maximumOffset = range.span.maximum - width + 1 - centeredStart;
      throw new BuildScriptValidationError([
        `${field("width")} ${width} with offset ${offset} does not fit between the target's corner supports; use an offset from ${minimumOffset} to ${maximumOffset}, or omit offset to center the entrance.`
      ]);
    }
    componentBounds = facadeBox(target.bounds, selectedSide, range.start, range.end, target.bounds.minY + 1, target.bounds.minY + height);
    operation = { type: raw.type, id, target: target.id, side: selectedSide, width, height, offset };
  } else if (raw.type === "windows") {
    const target = targetComponent(raw.target, field("target"), context);
    const selectedSide = raw.side === undefined ? "front" : raw.side;
    if (selectedSide !== "all" && selectedSide !== "front" && selectedSide !== "back" && selectedSide !== "left" && selectedSide !== "right") {
      throw new BuildScriptValidationError([`${field("side")} must be front, back, left, right, or all.`]);
    }
    const count = integer(raw.count, field("count"), 1, 24);
    const width = raw.width === undefined ? 1 : integer(raw.width, field("width"), 1, 6);
    const height = raw.height === undefined ? 2 : integer(raw.height, field("height"), 1, 6);
    const sillHeight = raw.sillHeight === undefined ? 2 : integer(raw.sillHeight, field("sillHeight"), 1, 64);
    if (target.bounds.minY + sillHeight + height - 1 >= target.bounds.maxY) {
      throw new BuildScriptValidationError([`${field("sillHeight")} and height must leave a top wall support.`]);
    }
    const normalizedSide = selectedSide as BuildScriptSide | "all";
    const targetSides: readonly BuildScriptSide[] = normalizedSide === "all" ? ["front", "back", "left", "right"] : [normalizedSide];
    for (const targetSide of targetSides) {
      const span = sideSpan(target.bounds, targetSide);
      if (width > span.maximum - span.minimum + 1) {
        throw new BuildScriptValidationError([`${field("width")} does not fit between the target's corner supports.`]);
      }
    }
    componentBounds = {
      ...target.bounds,
      minY: target.bounds.minY + sillHeight,
      maxY: target.bounds.minY + sillHeight + height - 1
    };
    operation = {
      type: raw.type,
      id,
      target: target.id,
      side: normalizedSide,
      count,
      width,
      height,
      sillHeight,
      material: material(raw.material, field("material"), context.palette)
    };
  } else if (raw.type === "porch") {
    const target = targetComponent(raw.target, field("target"), context);
    const selectedSide = side(raw.side, field("side"));
    const span = sideSpan(target.bounds, selectedSide);
    const width = integer(raw.width, field("width"), 1, 32);
    const depth = integer(raw.depth, field("depth"), 1, 16);
    if (width > span.maximum - span.minimum + 1) {
      throw new BuildScriptValidationError([`${field("width")} does not fit between the target's corner supports.`]);
    }
    componentBounds = exteriorBox(target.bounds, selectedSide, width, depth);
    operation = {
      type: raw.type,
      id,
      target: target.id,
      side: selectedSide,
      width,
      depth,
      material: material(raw.material, field("material"), context.palette)
    };
  } else if (raw.type === "path") {
    const target = anyTargetComponent(raw.target, field("target"), context);
    if (target.type !== "entrance" || !target.side || !target.targetId) {
      throw new BuildScriptValidationError([`${field("target")} must reference an entrance component.`]);
    }
    const length = integer(raw.length, field("length"), 2, 48);
    const width = integer(raw.width, field("width"), 1, 10);
    const entranceCenterX = Math.floor((target.bounds.minX + target.bounds.maxX) / 2);
    const entranceCenterZ = Math.floor((target.bounds.minZ + target.bounds.maxZ) / 2);
    const half = Math.floor(width / 2);
    if (target.side === "front") componentBounds = { minX: entranceCenterX - half, maxX: entranceCenterX - half + width - 1, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: target.bounds.minZ - length, maxZ: target.bounds.minZ - 1 };
    else if (target.side === "back") componentBounds = { minX: entranceCenterX - half, maxX: entranceCenterX - half + width - 1, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: target.bounds.maxZ + 1, maxZ: target.bounds.maxZ + length };
    else if (target.side === "left") componentBounds = { minX: target.bounds.minX - length, maxX: target.bounds.minX - 1, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: entranceCenterZ - half, maxZ: entranceCenterZ - half + width - 1 };
    else componentBounds = { minX: target.bounds.maxX + 1, maxX: target.bounds.maxX + length, minY: target.bounds.minY - 1, maxY: target.bounds.minY - 1, minZ: entranceCenterZ - half, maxZ: entranceCenterZ - half + width - 1 };
    operation = { type: raw.type, id, target: target.id, length, width, material: material(raw.material, field("material"), context.palette) };
  } else if (raw.type === "copyMirror") {
    const target = anyTargetComponent(raw.target, field("target"), context);
    if (raw.mode !== "copy" && raw.mode !== "mirror") {
      throw new BuildScriptValidationError([`${field("mode")} must be copy or mirror.`]);
    }
    if (raw.mode === "copy") {
      const offset = signedPosition(raw.offset, field("offset"));
      if (offset.every((value) => value === 0)) throw new BuildScriptValidationError([`${field("offset")} cannot be zero in every axis.`]);
      operation = { type: raw.type, id, target: target.id, mode: raw.mode, offset };
    } else {
      if (raw.axis !== "x" && raw.axis !== "z") throw new BuildScriptValidationError([`${field("axis")} must be x or z.`]);
      const pivot = integer(raw.pivot, field("pivot"), 0, SCENE_MAX_COORDINATE);
      operation = { type: raw.type, id, target: target.id, mode: raw.mode, axis: raw.axis, pivot };
    }
    componentBounds = transformedBounds(target.bounds, operation);
  } else {
    throw new BuildScriptValidationError([`operations[${index}].type \"${String(raw.type)}\" is not supported by BuildScript v1 yet.`]);
  }

  assertInsideScene(componentBounds, context.bounds, `operations[${index}]`);
  context.components.set(id, {
    id,
    type: operation.type,
    bounds: componentBounds,
    ...(operation.type === "entrance" ? { targetId: operation.target, side: operation.side ?? "front" } : {})
  });
  return operation;
}

export function validateBuildScript(
  value: unknown,
  budgets: Pick<BuildScriptBudgets, "maxOperations"> = DEFAULT_BUILD_SCRIPT_BUDGETS
): BuildScript {
  const raw = record(value, "BuildScript");
  if (raw.version !== 1) throw new BuildScriptValidationError(["version must be 1."]);
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.trim().length > 80) {
    throw new BuildScriptValidationError(["name must contain from 1 to 80 characters."]);
  }
  const rawBounds = record(raw.bounds, "bounds");
  const isCurrentBounds = rawBounds.width === SCENE_SIZE && rawBounds.depth === SCENE_SIZE && rawBounds.maxHeight === SCENE_SIZE;
  const isLegacyBounds = rawBounds.width === 64 && rawBounds.depth === 64 && rawBounds.maxHeight === 64;
  if (!isCurrentBounds && !isLegacyBounds) {
    throw new BuildScriptValidationError([`bounds must be exactly ${SCENE_SIZE}x${SCENE_SIZE}x${SCENE_SIZE} for BuildScript v1.`]);
  }
  const bounds: BuildScriptBounds = { width: SCENE_SIZE, depth: SCENE_SIZE, maxHeight: SCENE_SIZE };
  const palette = validatePalette(raw.palette);
  if (!Array.isArray(raw.operations) || !raw.operations.length) {
    throw new BuildScriptValidationError(["operations must contain at least one operation."]);
  }
  if (raw.operations.length > budgets.maxOperations) {
    throw new BuildScriptValidationError([`operations exceeds the ${budgets.maxOperations} operation budget.`]);
  }
  const context: ValidationContext = { palette, bounds, components: new Map() };
  const operations = raw.operations.map((operation, index) => validateOperation(operation, index, context));
  return { version: 1, name: raw.name.trim(), bounds, palette, operations };
}
