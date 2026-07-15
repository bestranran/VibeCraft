import assert from "node:assert/strict";
import test from "node:test";
import { acceptPendingEdit, createBuildingDocument, redoDocument, rejectPendingEdit, setPendingEdit, undoDocument } from "../lib/building-document";
import { createVoxelEditContext, assertVoxelEditScope, VoxelEditScopeError } from "../lib/voxel-edit-context";
import { createVoxelToolPendingEdit, executeVoxelTools } from "../lib/voxel-tools";
import type { GenerationMetadata, VoxelBlock, VoxelStructure, VoxelToolCall } from "../lib/structure";

function fixture(name: string, blocks: VoxelBlock[]): VoxelStructure {
  return { name, size: [0, 0, 0], blocks };
}

function fillBlocks(ownerId: string, from: [number, number, number], to: [number, number, number], id: VoxelBlock["id"]): VoxelBlock[] {
  const blocks: VoxelBlock[] = [];
  for (let y = from[1]; y <= to[1]; y += 1) for (let z = from[2]; z <= to[2]; z += 1) for (let x = from[0]; x <= to[0]; x += 1) {
    blocks.push({ x, y, z, id, ownerId });
  }
  return blocks;
}

test("component edit context summarizes owner bounds, materials, metadata, and locks", () => {
  const structure = fixture("robot", [
    ...fillBlocks("torso", [20, 4, 20], [22, 8, 22], "minecraft:iron_block"),
    ...fillBlocks("left-arm", [17, 5, 21], [19, 6, 21], "minecraft:yellow_concrete"),
    ...fillBlocks("right-arm", [23, 5, 21], [25, 6, 21], "minecraft:cyan_concrete")
  ]);
  const metadata = {
    prompt: "a robot",
    seed: 7,
    provider: "deepseek-buildscript",
    compilerVersion: "test",
    operationCount: 1,
    blockCount: structure.blocks.length,
    validationWarnings: [],
    buildScript: {
      version: 1,
      name: "robot",
      bounds: { width: 64, depth: 64, maxHeight: 64 },
      palette: { metal: "minecraft:iron_block" },
      operations: [{ type: "foundation", id: "torso", origin: [20, 4, 20], size: [3, 1, 3], material: "minecraft:iron_block" }]
    }
  } as GenerationMetadata;
  const context = createVoxelEditContext(structure, {
    generationMetadata: metadata,
    writableBounds: { minX: 10, minY: 0, minZ: 10, maxX: 30, maxY: 20, maxZ: 30 },
    semanticRegions: [{ id: "right-arm-lock", locked: true, bounds: { minX: 23, minY: 5, minZ: 21, maxX: 25, maxY: 6, maxZ: 21 } }]
  });

  assert.equal(context.scene.blockCount, structure.blocks.length);
  assert.deepEqual(context.scene.palette, ["minecraft:cyan_concrete", "minecraft:iron_block", "minecraft:yellow_concrete"]);
  assert.deepEqual(context.components.find((component) => component.ownerId === "left-arm"), {
    ownerId: "left-arm",
    bounds: { minX: 17, minY: 5, minZ: 21, maxX: 19, maxY: 6, maxZ: 21 },
    blockCount: 6,
    materials: ["minecraft:yellow_concrete"]
  });
  assert.equal(context.components.find((component) => component.ownerId === "torso")?.buildScriptOperation?.type, "foundation");
  assert.equal(context.generation?.buildScriptOperations[0].id, "torso");
  assert.equal(context.lockedRegions[0].id, "right-arm-lock");
});

test("robot arm edit remains local and undeclared component changes are rejected", () => {
  const robot = fixture("robot", [
    ...fillBlocks("torso", [20, 4, 20], [22, 8, 22], "minecraft:iron_block"),
    ...fillBlocks("left-arm", [17, 5, 21], [19, 6, 21], "minecraft:yellow_concrete"),
    ...fillBlocks("right-arm", [23, 5, 21], [25, 6, 21], "minecraft:cyan_concrete")
  ]);
  const torsoBefore = robot.blocks.filter((block) => block.ownerId === "torso");
  const rightBefore = robot.blocks.filter((block) => block.ownerId === "right-arm");
  const execution = executeVoxelTools(robot, [
    { type: "fill", from: [17, 5, 20], to: [19, 6, 20], material: "minecraft:yellow_concrete", ownerId: "left-arm", mode: "empty" },
    { type: "fill", from: [17, 5, 22], to: [19, 6, 22], material: "minecraft:yellow_concrete", ownerId: "left-arm", mode: "empty" }
  ]);
  assert.doesNotThrow(() => assertVoxelEditScope(execution.patch, ["left-arm"]));
  assert.deepEqual(execution.structure.blocks.filter((block) => block.ownerId === "torso"), torsoBefore);
  assert.deepEqual(execution.structure.blocks.filter((block) => block.ownerId === "right-arm"), rightBefore);
  assert.equal(execution.structure.blocks.filter((block) => block.ownerId === "left-arm").length, 18);

  const unsafe = executeVoxelTools(robot, [{ type: "remove", from: [20, 4, 20], to: [20, 4, 20] }]);
  assert.throws(() => assertVoxelEditScope(unsafe.patch, ["left-arm"]), VoxelEditScopeError);
});

test("fountain edits change only basin and water without inventing building parts", () => {
  const fountain = fixture("fountain", [
    ...fillBlocks("basin", [20, 0, 20], [26, 0, 26], "minecraft:stone_bricks"),
    ...fillBlocks("water", [22, 1, 22], [24, 1, 24], "minecraft:cyan_concrete"),
    ...fillBlocks("center-statue", [23, 2, 23], [23, 6, 23], "minecraft:oxidized_copper")
  ]);
  const statueBefore = fountain.blocks.filter((block) => block.ownerId === "center-statue");
  const calls: VoxelToolCall[] = [
    { type: "fill", from: [18, 0, 18], to: [28, 0, 19], material: "minecraft:stone_bricks", ownerId: "basin", mode: "empty" },
    { type: "fill", from: [18, 0, 27], to: [28, 0, 28], material: "minecraft:stone_bricks", ownerId: "basin", mode: "empty" },
    { type: "fill", from: [18, 0, 20], to: [19, 0, 26], material: "minecraft:stone_bricks", ownerId: "basin", mode: "empty" },
    { type: "fill", from: [27, 0, 20], to: [28, 0, 26], material: "minecraft:stone_bricks", ownerId: "basin", mode: "empty" },
    { type: "replace", from: [22, 1, 22], to: [24, 1, 24], fromMaterial: "minecraft:cyan_concrete", toMaterial: "minecraft:blue_concrete", ownerId: "water" }
  ];
  const execution = executeVoxelTools(fountain, calls);
  assertVoxelEditScope(execution.patch, ["water"]);
  assert.deepEqual(execution.structure.blocks.filter((block) => block.ownerId === "center-statue"), statueBefore);
  assert.ok(execution.structure.blocks.some((block) => block.ownerId === "water" && block.id === "minecraft:blue_concrete"));
  assert.equal(execution.structure.blocks.some((block) => /roof|door|facade/.test(block.ownerId ?? "")), false);
});

test("building chimney removal and tower copy are bounded component edits", () => {
  const building = fixture("castle", [
    ...fillBlocks("main-building", [20, 0, 20], [30, 5, 30], "minecraft:stone_bricks"),
    ...fillBlocks("chimney", [27, 6, 25], [27, 10, 25], "minecraft:brick"),
    ...fillBlocks("right-tower", [34, 0, 22], [36, 7, 24], "minecraft:polished_deepslate")
  ]);
  const mainBefore = building.blocks.filter((block) => block.ownerId === "main-building");
  const removed = executeVoxelTools(building, [{ type: "remove", from: [27, 6, 25], to: [27, 10, 25] }]);
  assertVoxelEditScope(removed.patch, ["chimney"]);
  assert.equal(removed.structure.blocks.some((block) => block.ownerId === "chimney"), false);
  assert.deepEqual(removed.structure.blocks.filter((block) => block.ownerId === "main-building"), mainBefore);

  const copied = executeVoxelTools(removed.structure, [{
    type: "copy",
    source: { minX: 34, minY: 0, minZ: 22, maxX: 36, maxY: 7, maxZ: 24 },
    offset: [-18, 0, 0],
    ownerId: "left-tower",
    mode: "empty"
  }]);
  assertVoxelEditScope(copied.patch, []);
  assert.equal(copied.structure.blocks.filter((block) => block.ownerId === "left-tower").length, 72);
  assert.ok(copied.structure.blocks.filter((block) => block.ownerId === "left-tower").every((block) => block.x >= 16 && block.x <= 18));
});

test("several general edits remain lossless through preview, reject, undo, and redo", () => {
  const initial = fixture("robot", [
    ...fillBlocks("torso", [20, 4, 20], [22, 8, 22], "minecraft:iron_block"),
    ...fillBlocks("left-arm", [17, 5, 21], [19, 6, 21], "minecraft:yellow_concrete")
  ]);
  const firstCalls: VoxelToolCall[] = [{ type: "fill", from: [17, 5, 20], to: [19, 6, 20], material: "minecraft:yellow_concrete", ownerId: "left-arm", mode: "empty" }];
  const firstExecution = executeVoxelTools(initial, firstCalls);
  let document = setPendingEdit(createBuildingDocument(initial), createVoxelToolPendingEdit("thicken arm", firstExecution, firstCalls));
  assert.deepEqual(rejectPendingEdit(document).structure, initial);
  document = acceptPendingEdit(document, { id: "first", createdAt: 1 });

  const secondCalls: VoxelToolCall[] = [{ type: "replace", from: [20, 4, 20], to: [22, 8, 22], fromMaterial: "minecraft:iron_block", toMaterial: "minecraft:gray_concrete", ownerId: "torso" }];
  const secondExecution = executeVoxelTools(document.structure, secondCalls);
  document = acceptPendingEdit(setPendingEdit(document, createVoxelToolPendingEdit("darken torso", secondExecution, secondCalls)), { id: "second", createdAt: 2 });
  const final = document.structure;
  document = undoDocument(document);
  document = undoDocument(document);
  assert.deepEqual(document.structure, initial);
  document = redoDocument(document);
  document = redoDocument(document);
  assert.deepEqual(document.structure, final);
  assert.equal(document.history.length, 2);
});
