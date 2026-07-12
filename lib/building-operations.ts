import { calculateStructureSize, coordinateKey, diffStructures, normalizeStructure } from "./patches";
import { findFrontDoor, getBoundingBox, getFacadePlanes, getFoundationBlocks, getRoofBlocks, getWallBlocks } from "./structure-analysis";
import { BLOCK_IDS, isBlockId } from "./structure";
import type { BlockId, BuildingOperation, StructurePatch, VoxelBlock, VoxelStructure } from "./structure";

const MAX_BLOCKS = 12000;
const MAX_ADDED_PER_EDIT = 2500;
const MAX_COORDINATE = 128;

export class BuildingOperationError extends Error {}

type BlockMap = Map<string, VoxelBlock>;

function cloneMap(structure: VoxelStructure): BlockMap {
  return new Map(structure.blocks.map((block) => [coordinateKey(block), { ...block }]));
}

function setBlock(map: BlockMap, block: VoxelBlock) {
  if (!isBlockId(block.id)) throw new BuildingOperationError(`Unsupported block material: ${block.id}`);
  if ([block.x, block.y, block.z].some((value) => !Number.isInteger(value) || Math.abs(value) > MAX_COORDINATE)) {
    throw new BuildingOperationError("This edit would place blocks outside the safe build area.");
  }
  map.set(coordinateKey(block), block);
}

function resizeRoof(map: BlockMap, structure: VoxelStructure, heightDelta: number) {
  const roof = getRoofBlocks(structure);
  if (!roof.length) throw new BuildingOperationError("I could not identify a roof on this structure.");
  const delta = Math.max(-3, Math.min(6, Math.trunc(heightDelta)));
  if (!delta) throw new BuildingOperationError("Roof height must change by at least one block.");
  const minY = Math.min(...roof.map((block) => block.y));
  const maxY = Math.max(...roof.map((block) => block.y));
  const range = Math.max(1, maxY - minY);
  roof.forEach((block) => map.delete(coordinateKey(block)));

  const layers = Array.from(new Set(roof.map((block) => block.y))).sort((a, b) => a - b);
  const targetY = new Map(layers.map((y) => {
    const progress = (y - minY) / range;
    return [y, Math.max(minY, y + Math.round(delta * progress))];
  }));

  for (const block of roof) {
    const layerIndex = layers.indexOf(block.y);
    const top = targetY.get(block.y) ?? block.y;
    const previousTop = layerIndex > 0 ? targetY.get(layers[layerIndex - 1]) ?? top : top;
    const bottom = delta > 0 && layerIndex > 0 ? Math.min(top, previousTop) : top;
    for (let y = bottom; y <= top; y += 1) {
      const rebuilt = { ...block, y };
      if (!map.has(coordinateKey(rebuilt))) setBlock(map, rebuilt);
    }
  }
}

function addWindows(map: BlockMap, structure: VoxelStructure, side: Extract<BuildingOperation, { type: "addWindows" }>["side"], count: number) {
  const bounds = getBoundingBox(structure);
  const facades = getFacadePlanes(structure);
  const door = findFrontDoor(structure);
  if (!bounds || !facades) throw new BuildingOperationError("Generate a structure before adding windows.");
  const wallBlocks = getWallBlocks(structure).filter((block) => block.id !== "minecraft:oak_log" && block.y >= bounds.minY + 2 && block.y <= bounds.maxY - 1);
  const sides = side === "all" ? ["front", "back", "left", "right"] as const : [side];
  let changed = 0;
  const targetCount = Math.max(1, Math.min(12, Math.trunc(count)));
  for (const targetSide of sides) {
    const candidates = wallBlocks.filter((block) => {
      if (Math.abs(block.x - door.x) <= 1 && block.z === door.z && block.y <= door.y + 2) return false;
      if (targetSide === "front") return block.z === facades.front;
      if (targetSide === "back") return block.z === facades.back;
      if (targetSide === "left") return block.x === facades.left;
      return block.x === facades.right;
    }).sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
    const uniqueColumns = new Map<number, VoxelBlock>();
    for (const block of candidates) {
      const axis = targetSide === "front" || targetSide === "back" ? block.x : block.z;
      if (!uniqueColumns.has(axis)) uniqueColumns.set(axis, block);
    }
    const choices = Array.from(uniqueColumns.values());
    const wanted = side === "all" ? Math.max(1, Math.ceil(targetCount / 4)) : targetCount;
    for (let index = 0; index < wanted && choices.length; index += 1) {
      const position = choices[Math.floor(((index + 1) * choices.length) / (wanted + 1))];
      setBlock(map, { ...position, id: "minecraft:glass_pane" });
      changed += 1;
    }
  }
  if (!changed) throw new BuildingOperationError("I could not find safe wall positions for new windows.");
}

function addChimney(map: BlockMap, structure: VoxelStructure, side: "left" | "right") {
  const bounds = getBoundingBox(structure);
  const roof = getRoofBlocks(structure);
  if (!bounds || !roof.length) throw new BuildingOperationError("I could not find a roof for the chimney.");
  const xTarget = side === "left" ? bounds.minX + 2 : bounds.maxX - 2;
  const roofNearSide = roof.filter((block) => Math.abs(block.x - xTarget) <= 2);
  const anchor = roofNearSide.sort((a, b) => b.y - a.y)[0] ?? roof.sort((a, b) => b.y - a.y)[0];
  const top = Math.min(MAX_COORDINATE, Math.max(bounds.maxY + 2, anchor.y + 3));
  for (let y = Math.max(bounds.minY + 2, anchor.y - 1); y <= top; y += 1) {
    setBlock(map, { x: anchor.x, y, z: anchor.z, id: y === top ? "minecraft:cobblestone" : "minecraft:brick" });
  }
}

function addPath(map: BlockMap, structure: VoxelStructure, length: number, width: number, material: BlockId) {
  const door = findFrontDoor(structure);
  const safeLength = Math.max(2, Math.min(24, Math.trunc(length)));
  const safeWidth = Math.max(1, Math.min(5, Math.trunc(width)));
  const half = Math.floor(safeWidth / 2);
  for (let step = 1; step <= safeLength; step += 1) {
    for (let offset = -half; offset < safeWidth - half; offset += 1) {
      setBlock(map, { x: door.x + offset, y: door.y, z: door.z - step, id: material });
    }
  }
}

function changePalette(map: BlockMap, structure: VoxelStructure, operation: Extract<BuildingOperation, { type: "changePalette" }>) {
  let region: VoxelBlock[];
  if (operation.region === "roof") region = getRoofBlocks(structure);
  else if (operation.region === "walls") region = getWallBlocks(structure);
  else if (operation.region === "foundation") region = getFoundationBlocks(structure);
  else region = structure.blocks;
  const targets = region.filter((block) => (!operation.from || block.id === operation.from) && block.id !== "minecraft:glass_pane" && block.id !== "minecraft:lantern");
  if (!targets.length) throw new BuildingOperationError("No blocks matched that material or region.");
  targets.forEach((block) => setBlock(map, { ...block, id: operation.to }));
}

function addFloor(map: BlockMap, structure: VoxelStructure, count: number) {
  const bounds = getBoundingBox(structure);
  const roof = getRoofBlocks(structure);
  if (!bounds || !roof.length) throw new BuildingOperationError("I could not identify the walls and roof for another floor.");
  const safeCount = Math.max(1, Math.min(3, Math.trunc(count)));
  const height = safeCount * 3;
  const roofKeys = new Set(roof.map(coordinateKey));
  roof.forEach((block) => map.delete(coordinateKey(block)));
  for (const block of roof) setBlock(map, { ...block, y: block.y + height });
  const wallCandidates = getWallBlocks(structure).filter((block) => block.y >= bounds.minY + 1 && block.y < Math.min(...roof.map((block) => block.y)));
  const topWallY = Math.max(...wallCandidates.map((block) => block.y));
  const template = wallCandidates.filter((block) => block.y === topWallY && !roofKeys.has(coordinateKey(block)));
  for (let dy = 1; dy <= height; dy += 1) {
    for (const block of template) setBlock(map, { ...block, y: topWallY + dy, id: dy === 2 && block.id.includes("planks") && (block.x + block.z) % 3 === 0 ? "minecraft:glass_pane" : block.id });
  }
}

function removeFeature(map: BlockMap, structure: VoxelStructure, feature: "chimney" | "path" | "windows") {
  const bounds = getBoundingBox(structure);
  const facades = getFacadePlanes(structure);
  if (!bounds || !facades) return;
  if (feature === "windows") {
    const nearbyWalls = getWallBlocks(structure);
    const replacement = nearbyWalls.find((block) => block.id.includes("planks"))?.id ?? "minecraft:oak_planks";
    structure.blocks.filter((block) => block.id === "minecraft:glass_pane").forEach((block) => setBlock(map, { ...block, id: replacement }));
    return;
  }
  if (feature === "path") {
    structure.blocks.filter((block) => block.y <= bounds.minY && block.z < facades.front).forEach((block) => map.delete(coordinateKey(block)));
    return;
  }
  const roof = getRoofBlocks(structure);
  const roofMinY = roof.length ? Math.min(...roof.map((block) => block.y)) : bounds.maxY;
  structure.blocks.filter((block) => (block.id === "minecraft:brick" || block.id === "minecraft:cobblestone") && block.y >= roofMinY - 1).forEach((block) => map.delete(coordinateKey(block)));
}

export function applyBuildingOperations(structure: VoxelStructure, operations: BuildingOperation[]): { structure: VoxelStructure; patch: StructurePatch } {
  if (!structure.blocks.length) throw new BuildingOperationError("Generate a building before editing it.");
  if (!operations.length) throw new BuildingOperationError("No valid building operations were provided.");
  const base = normalizeStructure(structure);
  const map = cloneMap(base);
  let working = base;
  for (const operation of operations) {
    if (operation.type === "resizeRoof") resizeRoof(map, working, operation.heightDelta);
    else if (operation.type === "addWindows") addWindows(map, working, operation.side, operation.count);
    else if (operation.type === "addChimney") addChimney(map, working, operation.side);
    else if (operation.type === "addPath") addPath(map, working, operation.length, operation.width, operation.material);
    else if (operation.type === "changePalette") changePalette(map, working, operation);
    else if (operation.type === "addFloor") addFloor(map, working, operation.count);
    else removeFeature(map, working, operation.feature);
    const blocks = Array.from(map.values());
    working = { ...base, blocks, size: calculateStructureSize(blocks) };
  }
  if (!working.blocks.length) throw new BuildingOperationError("That edit would remove the entire structure.");
  if (working.blocks.length > MAX_BLOCKS) throw new BuildingOperationError(`This edit exceeds the ${MAX_BLOCKS.toLocaleString()} block safety limit.`);
  const patch = diffStructures(base, normalizeStructure(working));
  const additions = patch.changes.filter((change) => change.type === "add").length;
  if (additions > MAX_ADDED_PER_EDIT) throw new BuildingOperationError("That edit adds too many blocks at once. Try a smaller change.");
  if (!patch.changes.length) throw new BuildingOperationError("That request does not change this building.");
  return { structure: normalizeStructure(working), patch };
}

export const AVAILABLE_BLOCK_IDS = BLOCK_IDS;
