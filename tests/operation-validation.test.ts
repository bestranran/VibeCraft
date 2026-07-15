import assert from "node:assert/strict";
import test from "node:test";
import { validateBuildingOperations } from "../lib/operation-validation";

test("validates a combined DeepSeek operation plan", () => {
  const operations = validateBuildingOperations([
    { type: "resizeRoof", heightDelta: 2 },
    { type: "addChimney", side: "left" },
    { type: "changePalette", to: "minecraft:dark_oak_planks", region: "walls" }
  ]);
  assert.equal(operations.length, 3);
  assert.equal(operations[2].type, "changePalette");
});

test("rejects invented operations, materials, and unsafe bounds", () => {
  assert.throws(() => validateBuildingOperations([{ type: "destroyBuilding" }]), /Unsupported operation/);
  assert.throws(() => validateBuildingOperations([{ type: "addFloor", count: 99 }]), /count must be/);
  assert.throws(() => validateBuildingOperations([{ type: "changePalette", to: "mod:diamond_block" }]), /target block/);
});
