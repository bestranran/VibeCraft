import { coordinateKey } from "./patches";
import type { BlockId, QualityReport, VoxelBlock, VoxelStructure } from "./structure";

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

export type FacadePlanes = { front: number; back: number; left: number; right: number; minY: number; maxWallY: number };

export function getBoundingBox(structure: VoxelStructure): Bounds | null {
  if (!structure.blocks.length) return null;
  return structure.blocks.reduce<Bounds>((bounds, block) => ({
    minX: Math.min(bounds.minX, block.x), maxX: Math.max(bounds.maxX, block.x),
    minY: Math.min(bounds.minY, block.y), maxY: Math.max(bounds.maxY, block.y),
    minZ: Math.min(bounds.minZ, block.z), maxZ: Math.max(bounds.maxZ, block.z)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

const ROOF_IDS = new Set<BlockId>(["minecraft:spruce_stairs"]);
const FOUNDATION_IDS = new Set<BlockId>(["minecraft:stone_bricks", "minecraft:cobblestone", "minecraft:red_sandstone"]);

export function getFoundationBlocks(structure: VoxelStructure) {
  const bounds = getBoundingBox(structure);
  if (!bounds) return [];
  return structure.blocks.filter((block) => block.y <= bounds.minY + 1 && FOUNDATION_IDS.has(block.id));
}

export function getRoofBlocks(structure: VoxelStructure): VoxelBlock[] {
  const bounds = getBoundingBox(structure);
  if (!bounds) return [];
  const explicit = structure.blocks.filter((block) => ROOF_IDS.has(block.id));
  if (explicit.length) {
    const minRoofY = Math.min(...explicit.map((block) => block.y));
    return structure.blocks.filter((block) => block.y >= minRoofY && (ROOF_IDS.has(block.id) || block.id.includes("planks")));
  }
  const roofStart = bounds.minY + Math.max(2, Math.floor((bounds.maxY - bounds.minY) * 0.72));
  return structure.blocks.filter((block) => block.y >= roofStart && block.id !== "minecraft:lantern");
}

export function getWallBlocks(structure: VoxelStructure): VoxelBlock[] {
  const facades = getFacadePlanes(structure);
  const roof = new Set(getRoofBlocks(structure).map(coordinateKey));
  if (!facades) return [];
  return structure.blocks.filter((block) => {
    if (roof.has(coordinateKey(block)) || block.y <= facades.minY || block.y > facades.maxWallY || block.id === "minecraft:glass_pane") return false;
    return block.x === facades.left || block.x === facades.right || block.z === facades.front || block.z === facades.back;
  });
}

function mostPopulatedPlane(values: number[], direction: "min" | "max") {
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || (direction === "min" ? a[0] - b[0] : b[0] - a[0]))[0]?.[0] ?? 0;
}

export function getFacadePlanes(structure: VoxelStructure): FacadePlanes | null {
  const bounds = getBoundingBox(structure);
  if (!bounds) return null;
  const roof = getRoofBlocks(structure);
  const roofMinY = roof.length ? Math.min(...roof.map((block) => block.y)) : bounds.maxY + 1;
  const candidates = structure.blocks.filter((block) => block.y >= bounds.minY + 2 && block.y < roofMinY && block.id !== "minecraft:lantern");
  if (!candidates.length) return { front: bounds.minZ, back: bounds.maxZ, left: bounds.minX, right: bounds.maxX, minY: bounds.minY, maxWallY: roofMinY - 1 };
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  return {
    front: mostPopulatedPlane(candidates.filter((block) => block.z <= centerZ).map((block) => block.z), "min"),
    back: mostPopulatedPlane(candidates.filter((block) => block.z >= centerZ).map((block) => block.z), "max"),
    left: mostPopulatedPlane(candidates.filter((block) => block.x <= centerX).map((block) => block.x), "min"),
    right: mostPopulatedPlane(candidates.filter((block) => block.x >= centerX).map((block) => block.x), "max"),
    minY: bounds.minY,
    maxWallY: roofMinY - 1
  };
}

export function findFrontDoor(structure: VoxelStructure): { x: number; y: number; z: number; direction: "front" } {
  const facades = getFacadePlanes(structure);
  if (!facades) return { x: 0, y: 0, z: 0, direction: "front" };
  const map = new Set(structure.blocks.map(coordinateKey));
  for (let x = facades.left + 1; x < facades.right; x += 1) {
    const lower = `${x},${facades.minY + 1},${facades.front}`;
    const upper = `${x},${facades.minY + 2},${facades.front}`;
    if (!map.has(lower) && !map.has(upper)) return { x, y: facades.minY, z: facades.front, direction: "front" };
  }
  return { x: Math.round((facades.left + facades.right) / 2), y: facades.minY, z: facades.front, direction: "front" };
}

export function hasFeature(structure: VoxelStructure, feature: "chimney" | "path" | "windows") {
  const bounds = getBoundingBox(structure);
  const facades = getFacadePlanes(structure);
  if (!bounds || !facades) return false;
  if (feature === "windows") return structure.blocks.some((block) => block.id === "minecraft:glass_pane");
  if (feature === "path") return structure.blocks.some((block) => block.y <= bounds.minY && block.z < facades.front);
  const roofKeys = new Set(getRoofBlocks(structure).map(coordinateKey));
  return structure.blocks.some((block) => block.id === "minecraft:bricks" && block.y >= bounds.minY + 3 && !roofKeys.has(coordinateKey(block)));
}

export function summarizeStructure(structure: VoxelStructure) {
  const bounds = getBoundingBox(structure);
  const palette = Array.from(new Set(structure.blocks.map((block) => block.id)));
  return JSON.stringify({ name: structure.name, blocks: structure.blocks.length, bounds, palette });
}

export function analyzeStructureQuality(structure: VoxelStructure): QualityReport {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const block of structure.blocks) {
    const key = coordinateKey(block);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  const occupied = new Set(seen);
  const isolatedBlocks = structure.blocks.filter((block) => {
    if (block.id === "minecraft:lantern") return false;
    return [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].every(([dx,dy,dz]) => !occupied.has(`${block.x + dx},${block.y + dy},${block.z + dz}`));
  }).length;
  const warnings: string[] = [];
  if (!structure.blocks.length) warnings.push("The structure is empty.");
  if (duplicates) warnings.push(`${duplicates} duplicate coordinates need repair.`);
  if (isolatedBlocks) warnings.push(`${isolatedBlocks} isolated block${isolatedBlocks === 1 ? "" : "s"} detected.`);
  if (structure.blocks.length > 12000) warnings.push("The structure is close to the block limit.");
  const score = Math.max(0, Math.round(100 - duplicates * 4 - Math.min(30, isolatedBlocks * 2) - (structure.blocks.length ? 0 : 100)));
  return { score, warnings, metrics: { blockCount: structure.blocks.length, paletteSize: new Set(structure.blocks.map((block) => block.id)).size, isolatedBlocks, duplicateCoordinates: duplicates } };
}
