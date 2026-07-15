import assert from "node:assert/strict";
import test from "node:test";
import { acceptPendingEdit, createBuildingDocument, redoDocument, rejectPendingEdit, setPendingEdit, undoDocument } from "../lib/building-document";
import { applyPatch, invertPatch, normalizeStructure } from "../lib/patches";
import type { SemanticRegion, VoxelStructure, VoxelToolCall } from "../lib/structure";
import { createVoxelToolPendingEdit, executeVoxelTools, validateVoxelToolCalls, VoxelToolError } from "../lib/voxel-tools";

const empty: VoxelStructure = { name: "district", size: [0, 0, 0], blocks: [] };

test("a deterministic multi-tool plan produces one invertible patch", () => {
  const calls: VoxelToolCall[] = [
    { type: "fill", from: [1, 0, 1], to: [3, 0, 1], material: "minecraft:stone_bricks", ownerId: "road-main" },
    { type: "line", from: [1, 1, 1], to: [3, 3, 1], material: "minecraft:lantern", ownerId: "road-main" },
    { type: "replace", from: [2, 0, 1], to: [2, 0, 1], fromMaterial: "minecraft:stone_bricks", toMaterial: "minecraft:cobblestone" }
  ];
  const first = executeVoxelTools(empty, calls);
  const second = executeVoxelTools(empty, calls);
  assert.deepEqual(first, second);
  assert.deepEqual(applyPatch(empty, first.patch), first.structure);
  assert.deepEqual(applyPatch(first.structure, invertPatch(first.patch)), normalizeStructure(empty));
  assert.equal(first.reports.length, 3);
});

test("fill collision modes report skipped and replaced blocks", () => {
  const base = executeVoxelTools(empty, [{ type: "fill", from: [1, 0, 1], to: [1, 0, 1], material: "minecraft:brick" }]).structure;
  const skipped = executeVoxelTools(base, [
    { type: "fill", from: [1, 0, 1], to: [2, 0, 1], material: "minecraft:sandstone", mode: "empty" }
  ]);
  assert.deepEqual({ added: skipped.reports[0].added, replaced: skipped.reports[0].replaced, skipped: skipped.reports[0].skipped }, { added: 1, replaced: 0, skipped: 1 });
  const overwritten = executeVoxelTools(base, [{ type: "fill", from: [1, 0, 1], to: [1, 0, 1], material: "minecraft:sandstone" }]);
  assert.equal(overwritten.reports[0].replaced, 1);
});

test("scene, selection, and locked-region violations reject atomically", () => {
  const original: VoxelStructure = { name: "locked", size: [1, 1, 1], blocks: [{ x: 5, y: 0, z: 5, id: "minecraft:brick", ownerId: "tower" }] };
  const snapshot = structuredClone(original);
  const locked: SemanticRegion[] = [{ id: "tower", locked: true, bounds: { minX: 4, minY: 0, minZ: 4, maxX: 6, maxY: 10, maxZ: 6 } }];
  assert.throws(() => executeVoxelTools(original, [{ type: "remove", from: [5, 0, 5], to: [5, 0, 5] }], { regions: locked }), /locked coordinate/);
  assert.throws(() => executeVoxelTools(original, [{ type: "fill", from: [63, 0, 63], to: [64, 0, 63], material: "minecraft:brick" }]), /outside/);
  assert.throws(() => executeVoxelTools(original, [{ type: "fill", from: [3, 0, 3], to: [4, 0, 3], material: "minecraft:brick" }], { writableBounds: { minX: 0, minY: 0, minZ: 0, maxX: 3, maxY: 3, maxZ: 3 } }), /selection/);
  assert.deepEqual(original, snapshot);
});

test("copy and mirror use a source snapshot without cascading", () => {
  const base = executeVoxelTools(empty, [{ type: "fill", from: [1, 0, 1], to: [2, 0, 1], material: "minecraft:oak_planks" }]).structure;
  const copied = executeVoxelTools(base, [{ type: "copy", source: { minX: 1, minY: 0, minZ: 1, maxX: 2, maxY: 0, maxZ: 1 }, offset: [2, 0, 0] }]);
  assert.equal(copied.reports[0].added, 2);
  const mirrored = executeVoxelTools(base, [{ type: "mirror", source: { minX: 1, minY: 0, minZ: 1, maxX: 2, maxY: 0, maxZ: 1 }, axis: "x", pivot: 3 }]);
  assert.deepEqual(mirrored.structure.blocks.map((block) => block.x), [1, 2, 4, 5]);
});

test("budgets and runtime schemas reject unsafe plans", () => {
  assert.throws(() => executeVoxelTools(empty, [{ type: "fill", from: [0, 0, 0], to: [2, 0, 0], material: "minecraft:brick" }], { budgets: { maxCoordinates: 2 } }), /coordinate budget/);
  assert.throws(() => executeVoxelTools(empty, [
    { type: "fill", from: [0, 0, 0], to: [0, 0, 0], material: "minecraft:brick" },
    { type: "fill", from: [1, 0, 0], to: [1, 0, 0], material: "minecraft:brick" }
  ], { budgets: { maxCalls: 1 } }), /call budget/);
  assert.throws(() => executeVoxelTools(empty, [{ type: "fill", from: [0, 0, 0], to: [2, 0, 0], material: "minecraft:brick" }], { budgets: { maxChangedBlocks: 2 } }), /unique changed-block budget/);
  const repeatedlyChanged = executeVoxelTools(empty, [
    { type: "fill", from: [0, 0, 0], to: [0, 0, 0], material: "minecraft:brick" },
    { type: "fill", from: [0, 0, 0], to: [0, 0, 0], material: "minecraft:sandstone" },
    { type: "fill", from: [0, 0, 0], to: [0, 0, 0], material: "minecraft:stone_bricks" }
  ], { budgets: { maxChangedBlocks: 1 } });
  assert.equal(repeatedlyChanged.patch.changes.length, 1);
  assert.throws(() => validateVoxelToolCalls([{ type: "fill", from: [0, 0, 0], to: [0, 0, 0], material: "mod:diamond_block" }]), VoxelToolError);
});

test("a tool plan participates in accept, reject, undo, and redo as one transaction", () => {
  const calls: VoxelToolCall[] = [
    { type: "fill", from: [0, 0, 0], to: [2, 0, 0], material: "minecraft:stone_bricks" },
    { type: "remove", from: [1, 0, 0], to: [1, 0, 0] }
  ];
  const execution = executeVoxelTools(empty, calls);
  const document = setPendingEdit(createBuildingDocument(empty), createVoxelToolPendingEdit("road", execution, calls));
  assert.deepEqual(document.structure, empty);
  assert.deepEqual(rejectPendingEdit(document).structure, empty);
  const accepted = acceptPendingEdit(document, { id: "tools", createdAt: 1 });
  assert.equal(accepted.history.length, 1);
  assert.equal(accepted.history[0].toolCalls?.length, 2);
  assert.deepEqual(undoDocument(accepted).structure, empty);
  assert.deepEqual(redoDocument(undoDocument(accepted)).structure, execution.structure);
});
