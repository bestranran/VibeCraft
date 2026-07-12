import assert from "node:assert/strict";
import test from "node:test";
import { applyPatch, diffStructures, invertPatch, normalizeStructure } from "../lib/patches";
import type { VoxelStructure } from "../lib/structure";

const before: VoxelStructure = { name: "test", size: [2, 1, 1], blocks: [
  { x: 0, y: 0, z: 0, id: "minecraft:oak_planks" },
  { x: 1, y: 0, z: 0, id: "minecraft:oak_planks" }
] };
const after: VoxelStructure = { name: "test", size: [2, 2, 1], blocks: [
  { x: 0, y: 0, z: 0, id: "minecraft:stone_bricks" },
  { x: 0, y: 1, z: 0, id: "minecraft:brick" }
] };

test("diff, apply and invert patches are lossless", () => {
  const patch = diffStructures(before, after);
  assert.deepEqual(patch.changes.map((change) => change.type).sort(), ["add", "remove", "replace"]);
  assert.deepEqual(applyPatch(before, patch), normalizeStructure(after));
  assert.deepEqual(applyPatch(after, invertPatch(patch)), normalizeStructure(before));
});
