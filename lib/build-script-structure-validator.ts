import { coordinateKey } from "./patches";
import type { BuildScript, BuildScriptOperation, BuildScriptSide } from "./build-script";
import type { Box3D, VoxelBlock, VoxelStructure } from "./structure";

export type BuildScriptDiagnostic = {
  code:
    | "OUT_OF_BOUNDS"
    | "DUPLICATE_COORDINATE"
    | "MISSING_ENTRANCE"
    | "BLOCKED_ENTRANCE"
    | "OCCUPIED_INTERIOR"
    | "DISCONNECTED_ROOF"
    | "DETACHED_ROOF"
    | "LOW_CONNECTIVITY"
    | "FLOATING_COMPONENT"
    | "LOW_MATERIAL_CONTRAST";
  severity: "error" | "warning";
  message: string;
  ownerId?: string;
};

export type BuildScriptStructureReport = {
  valid: boolean;
  diagnostics: BuildScriptDiagnostic[];
  metrics: {
    blockCount: number;
    duplicateCoordinates: number;
    connectedComponents: number;
    primaryComponentRatio: number;
    floatingComponents: number;
    entranceCount: number;
    hollowInteriorRatio: number;
    paletteSize: number;
  };
};

type LogicalComponent = {
  bounds: Box3D;
  type: BuildScriptOperation["type"];
  targetId?: string;
  side?: BuildScriptSide;
};

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

function boundsFromOrigin(origin: [number, number, number], size: [number, number, number]): Box3D {
  return {
    minX: origin[0], minY: origin[1], minZ: origin[2],
    maxX: origin[0] + size[0] - 1,
    maxY: origin[1] + size[1] - 1,
    maxZ: origin[2] + size[2] - 1
  };
}

function centeredRange(bounds: Box3D, side: BuildScriptSide, width: number, offset = 0) {
  const minimum = side === "front" || side === "back" ? bounds.minX + 1 : bounds.minZ + 1;
  const maximum = side === "front" || side === "back" ? bounds.maxX - 1 : bounds.maxZ - 1;
  const start = Math.floor((minimum + maximum - width + 1) / 2) + offset;
  return { start, end: start + width - 1 };
}

function facadeBox(bounds: Box3D, side: BuildScriptSide, start: number, end: number, minY: number, maxY: number): Box3D {
  if (side === "front") return { minX: start, maxX: end, minY, maxY, minZ: bounds.minZ, maxZ: bounds.minZ };
  if (side === "back") return { minX: start, maxX: end, minY, maxY, minZ: bounds.maxZ, maxZ: bounds.maxZ };
  if (side === "left") return { minX: bounds.minX, maxX: bounds.minX, minY, maxY, minZ: start, maxZ: end };
  return { minX: bounds.maxX, maxX: bounds.maxX, minY, maxY, minZ: start, maxZ: end };
}

function contains(bounds: Box3D, block: Pick<VoxelBlock, "x" | "y" | "z">) {
  return block.x >= bounds.minX && block.x <= bounds.maxX && block.y >= bounds.minY && block.y <= bounds.maxY && block.z >= bounds.minZ && block.z <= bounds.maxZ;
}

function operationComponents(script: BuildScript): Map<string, LogicalComponent> {
  const components = new Map<string, LogicalComponent>();
  for (const operation of script.operations) {
    if (operation.type === "foundation" || operation.type === "hollowBox") {
      components.set(operation.id, { bounds: boundsFromOrigin(operation.origin, operation.size), type: operation.type });
    } else if (operation.type === "cylinder") {
      components.set(operation.id, {
        bounds: {
          minX: operation.origin[0] - operation.radius,
          maxX: operation.origin[0] + operation.radius,
          minY: operation.origin[1],
          maxY: operation.origin[1] + operation.height - 1,
          minZ: operation.origin[2] - operation.radius,
          maxZ: operation.origin[2] + operation.radius
        },
        type: operation.type
      });
    } else if (operation.type === "gableRoof" || operation.type === "flatRoof") {
      const target = components.get(operation.target)!;
      const overhang = operation.overhang ?? 0;
      const height = operation.type === "gableRoof" ? operation.height : operation.thickness ?? 1;
      components.set(operation.id, {
        bounds: {
          minX: target.bounds.minX - overhang,
          maxX: target.bounds.maxX + overhang,
          minY: target.bounds.maxY + 1,
          maxY: target.bounds.maxY + height,
          minZ: target.bounds.minZ - overhang,
          maxZ: target.bounds.maxZ + overhang
        },
        type: operation.type,
        targetId: operation.target
      });
    } else if (operation.type === "entrance") {
      const target = components.get(operation.target)!;
      const side = operation.side ?? "front";
      const range = centeredRange(target.bounds, side, operation.width ?? 2, operation.offset ?? 0);
      components.set(operation.id, {
        bounds: facadeBox(target.bounds, side, range.start, range.end, target.bounds.minY + 1, target.bounds.minY + (operation.height ?? 3)),
        type: operation.type,
        targetId: operation.target,
        side
      });
    } else if (operation.type === "copyMirror") {
      const target = components.get(operation.target)!;
      if (operation.mode === "copy") {
        const [x, y, z] = operation.offset ?? [0, 0, 0];
        components.set(operation.id, { bounds: { minX: target.bounds.minX + x, maxX: target.bounds.maxX + x, minY: target.bounds.minY + y, maxY: target.bounds.maxY + y, minZ: target.bounds.minZ + z, maxZ: target.bounds.maxZ + z }, type: operation.type, targetId: operation.target });
      } else {
        const pivot = operation.pivot ?? 0;
        components.set(operation.id, {
          bounds: operation.axis === "x"
            ? { ...target.bounds, minX: 2 * pivot - target.bounds.maxX, maxX: 2 * pivot - target.bounds.minX }
            : { ...target.bounds, minZ: 2 * pivot - target.bounds.maxZ, maxZ: 2 * pivot - target.bounds.minZ },
          type: operation.type,
          targetId: operation.target
        });
      }
    } else {
      const target = components.get(operation.target)!;
      components.set(operation.id, { bounds: { ...target.bounds }, type: operation.type, targetId: operation.target });
    }
  }
  return components;
}

function connectedGroups(blocks: VoxelBlock[]): VoxelBlock[][] {
  const map = new Map(blocks.map((block) => [coordinateKey(block), block]));
  const remaining = new Set(map.keys());
  const groups: VoxelBlock[][] = [];
  while (remaining.size) {
    const start = remaining.values().next().value as string;
    const pending = [start];
    const group: VoxelBlock[] = [];
    remaining.delete(start);
    while (pending.length) {
      const key = pending.pop()!;
      const block = map.get(key)!;
      group.push(block);
      for (const [dx, dy, dz] of NEIGHBORS) {
        const neighbor = `${block.x + dx},${block.y + dy},${block.z + dz}`;
        if (remaining.delete(neighbor)) pending.push(neighbor);
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

function pointKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

export function validateBuildScriptStructure(script: BuildScript, structure: VoxelStructure): BuildScriptStructureReport {
  const diagnostics: BuildScriptDiagnostic[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const block of structure.blocks) {
    const key = coordinateKey(block);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
    if (block.x < 0 || block.x >= script.bounds.width || block.y < 0 || block.y >= script.bounds.maxHeight || block.z < 0 || block.z >= script.bounds.depth) {
      diagnostics.push({ code: "OUT_OF_BOUNDS", severity: "error", message: `Block ${key} is outside scene bounds.`, ...(block.ownerId ? { ownerId: block.ownerId } : {}) });
    }
  }
  if (duplicates) diagnostics.push({ code: "DUPLICATE_COORDINATE", severity: "error", message: `${duplicates} duplicate block coordinate${duplicates === 1 ? " was" : "s were"} produced.` });

  const occupied = new Set(structure.blocks.map(coordinateKey));
  const components = operationComponents(script);
  const entrances = script.operations.filter((operation) => operation.type === "entrance");
  const boxes = script.operations.filter((operation) => operation.type === "hollowBox");

  for (const entrance of entrances) {
    const component = components.get(entrance.id)!;
    const target = components.get(entrance.target)!;
    let blocked = false;
    for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
      for (let z = component.bounds.minZ; z <= component.bounds.maxZ; z += 1) {
        for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
          if (occupied.has(pointKey(x, y, z))) blocked = true;
        }
      }
    }
    const centerX = Math.floor((component.bounds.minX + component.bounds.maxX) / 2);
    const centerZ = Math.floor((component.bounds.minZ + component.bounds.maxZ) / 2);
    const bottomY = target.bounds.minY + 1;
    const direction = component.side === "front" ? [0, -1] : component.side === "back" ? [0, 1] : component.side === "left" ? [-1, 0] : [1, 0];
    for (const y of [bottomY, bottomY + 1]) {
      if (occupied.has(pointKey(centerX + direction[0], y, centerZ + direction[1])) || occupied.has(pointKey(centerX - direction[0], y, centerZ - direction[1]))) blocked = true;
    }
    if (blocked) diagnostics.push({ code: "BLOCKED_ENTRANCE", severity: "warning", message: `Entrance \"${entrance.id}\" is not traversable from outside to inside.`, ownerId: entrance.id });
  }

  let interiorCoordinates = 0;
  let occupiedInteriorCoordinates = 0;
  for (const box of boxes) {
    const bounds = components.get(box.id)!.bounds;
    let occupiedInterior = 0;
    let interior = 0;
    for (let y = bounds.minY + 1; y <= bounds.maxY; y += 1) {
      for (let z = bounds.minZ + 1; z < bounds.maxZ; z += 1) {
        for (let x = bounds.minX + 1; x < bounds.maxX; x += 1) {
          interior += 1;
          if (occupied.has(pointKey(x, y, z))) occupiedInterior += 1;
        }
      }
    }
    interiorCoordinates += interior;
    occupiedInteriorCoordinates += occupiedInterior;
    if (interior && occupiedInterior / interior > 0.05) {
      diagnostics.push({ code: "OCCUPIED_INTERIOR", severity: "warning", message: `Volume \"${box.id}\" interior is ${Math.round((occupiedInterior / interior) * 100)}% occupied.`, ownerId: box.id });
    }
  }

  for (const roof of script.operations.filter((operation) => operation.type === "gableRoof" || operation.type === "flatRoof")) {
    const roofBounds = components.get(roof.id)!.bounds;
    const targetBounds = components.get(roof.target)!.bounds;
    const roofBlocks = structure.blocks.filter((block) => block.ownerId === roof.id && contains(roofBounds, block));
    const roofGroups = connectedGroups(roofBlocks);
    if (!roofBlocks.length || roofGroups.length !== 1) {
      diagnostics.push({ code: "DISCONNECTED_ROOF", severity: "warning", message: `Roof \"${roof.id}\" is not one connected surface.`, ownerId: roof.id });
    }
    const attached = roofBlocks.some((block) => block.y === targetBounds.maxY + 1 && (block.x === targetBounds.minX || block.x === targetBounds.maxX || block.z === targetBounds.minZ || block.z === targetBounds.maxZ));
    if (!attached) diagnostics.push({ code: "DETACHED_ROOF", severity: "warning", message: `Roof \"${roof.id}\" does not connect to target \"${roof.target}\".`, ownerId: roof.id });
  }

  const groups = connectedGroups(structure.blocks);
  const primaryRatio = structure.blocks.length ? (groups[0]?.length ?? 0) / structure.blocks.length : 0;
  if (structure.blocks.length && primaryRatio < 0.45) {
    diagnostics.push({ code: "LOW_CONNECTIVITY", severity: "warning", message: `The largest connected component contains only ${Math.round(primaryRatio * 100)}% of blocks.` });
  }
  const floating = groups.filter((group) => group.length >= 8 && !group.some((block) => block.y === 0));
  for (const group of floating) {
    const ownerId = group.find((block) => block.ownerId)?.ownerId;
    diagnostics.push({ code: "FLOATING_COMPONENT", severity: "warning", message: `A ${group.length}-block component has no connection to ground level.`, ...(ownerId ? { ownerId } : {}) });
  }

  const paletteSize = new Set(structure.blocks.map((block) => block.id)).size;
  if (paletteSize < 2) diagnostics.push({ code: "LOW_MATERIAL_CONTRAST", severity: "warning", message: "The compiled structure uses fewer than two visible materials." });
  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics,
    metrics: {
      blockCount: structure.blocks.length,
      duplicateCoordinates: duplicates,
      connectedComponents: groups.length,
      primaryComponentRatio: primaryRatio,
      floatingComponents: floating.length,
      entranceCount: entrances.length,
      hollowInteriorRatio: interiorCoordinates ? 1 - occupiedInteriorCoordinates / interiorCoordinates : 1,
      paletteSize
    }
  };
}
