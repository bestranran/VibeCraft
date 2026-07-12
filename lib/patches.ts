import type { StructurePatch, VoxelBlock, VoxelStructure } from "./structure";

export const coordinateKey = ({ x, y, z }: Pick<VoxelBlock, "x" | "y" | "z">) => `${x},${y},${z}`;

export function calculateStructureSize(blocks: VoxelBlock[]): [number, number, number] {
  if (!blocks.length) return [0, 0, 0];
  const xs = blocks.map((block) => block.x);
  const ys = blocks.map((block) => block.y);
  const zs = blocks.map((block) => block.z);
  return [Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1, Math.max(...zs) - Math.min(...zs) + 1];
}

export function normalizeStructure(structure: VoxelStructure): VoxelStructure {
  const map = new Map<string, VoxelBlock>();
  for (const block of structure.blocks) map.set(coordinateKey(block), { ...block });
  const blocks = Array.from(map.values()).sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  return { ...structure, blocks, size: calculateStructureSize(blocks) };
}

export function diffStructures(before: VoxelStructure, after: VoxelStructure): StructurePatch {
  const beforeMap = new Map(before.blocks.map((block) => [coordinateKey(block), block]));
  const afterMap = new Map(after.blocks.map((block) => [coordinateKey(block), block]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes: StructurePatch["changes"] = [];
  for (const key of keys) {
    const oldBlock = beforeMap.get(key);
    const newBlock = afterMap.get(key);
    if (!oldBlock && newBlock) changes.push({ type: "add", block: { ...newBlock } });
    else if (oldBlock && !newBlock) changes.push({ type: "remove", block: { ...oldBlock } });
    else if (oldBlock && newBlock && oldBlock.id !== newBlock.id) {
      changes.push({ type: "replace", before: { ...oldBlock }, after: { ...newBlock } });
    }
  }
  return { changes };
}

export function applyPatch(structure: VoxelStructure, patch: StructurePatch): VoxelStructure {
  const map = new Map(structure.blocks.map((block) => [coordinateKey(block), { ...block }]));
  for (const change of patch.changes) {
    if (change.type === "remove") map.delete(coordinateKey(change.block));
    else if (change.type === "add") map.set(coordinateKey(change.block), { ...change.block });
    else map.set(coordinateKey(change.after), { ...change.after });
  }
  return normalizeStructure({ ...structure, blocks: Array.from(map.values()) });
}

export function invertPatch(patch: StructurePatch): StructurePatch {
  return {
    changes: patch.changes.map((change) => {
      if (change.type === "add") return { type: "remove" as const, block: { ...change.block } };
      if (change.type === "remove") return { type: "add" as const, block: { ...change.block } };
      return { type: "replace" as const, before: { ...change.after }, after: { ...change.before } };
    })
  };
}
