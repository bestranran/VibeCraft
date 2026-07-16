import assert from "node:assert/strict";
import test from "node:test";
import { createBuildingDocument, setWorldPlan } from "../lib/building-document";
import type { Box2D, VoxelStructure } from "../lib/structure";
import { createLocalWorldPlan, promptSeed, validateWorldPlan, validateWorldPlanPreferences } from "../lib/world-planner";

const prompt = "Create a compact cyberpunk district with one main road, six buildings of varied height, a neon corporate tower, and two elevated walkways.";

function overlaps(a: Box2D, b: Box2D) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

test("local planning creates the milestone district layout", () => {
  const plan = createLocalWorldPlan(prompt);
  assert.deepEqual(plan.bounds, { width: 128, depth: 128, maxHeight: 128 });
  assert.equal(plan.roads.length, 1);
  assert.equal(plan.lots.length, 6);
  assert.equal(plan.landmarks.length, 1);
  assert.equal(plan.connections.filter((connection) => connection.kind === "bridge").length, 2);
  const road = plan.roads[0].bounds;
  assert.ok((road.minX === 0 && road.maxX === 127) || (road.minZ === 0 && road.maxZ === 127));
  for (let index = 0; index < plan.lots.length; index += 1) {
    const lot = plan.lots[index];
    assert.ok(!overlaps(lot.bounds, road));
    assert.ok(plan.lots.slice(index + 1).every((other) => !overlaps(lot.bounds, other.bounds)));
    assert.ok(lot.building.width <= lot.bounds.maxX - lot.bounds.minX + 1);
    assert.ok(lot.building.depth <= lot.bounds.maxZ - lot.bounds.minZ + 1);
  }
  const tallest = Math.max(...plan.lots.map((lot) => lot.building.height));
  const landmark = plan.landmarks[0];
  const landmarkLot = plan.lots.find((lot) => lot.bounds.minX === landmark.bounds.minX && lot.bounds.minZ === landmark.bounds.minZ);
  assert.equal(landmarkLot?.building.height, tallest);
});

test("prompt and seed are deterministic while regeneration produces a new layout", () => {
  const seed = promptSeed(prompt);
  assert.deepEqual(createLocalWorldPlan(prompt, seed), createLocalWorldPlan(prompt, seed));
  assert.notDeepEqual(createLocalWorldPlan(prompt, seed), createLocalWorldPlan(prompt, (seed + 1) >>> 0));
});

test("world-plan validation rejects overlapping lots and disconnected roads", () => {
  const plan = createLocalWorldPlan(prompt, 8);
  const overlap = structuredClone(plan);
  overlap.lots[1].bounds = { ...overlap.lots[0].bounds };
  assert.throws(() => validateWorldPlan(overlap), /overlaps another lot/);
  const disconnected = structuredClone(plan);
  disconnected.roads[0].bounds = { minX: 28, minZ: 4, maxX: 35, maxZ: 58 };
  assert.throws(() => validateWorldPlan(disconnected), /opposite scene boundaries/);
});

test("DeepSeek preferences are bounded before deterministic compilation", () => {
  const invalid = {
    name: "unsafe", themeName: "cyberpunk", palette: ["minecraft:stone_bricks", "minecraft:lantern"], roadOrientation: "north-south", roadWidth: 20,
    lots: Array.from({ length: 6 }, () => ({ purpose: "commercial", height: 20, roof: "flat", wallMaterial: "minecraft:bricks", roofMaterial: "minecraft:stone_bricks" })), landmarkLot: 0, bridgeRows: [0, 2]
  };
  assert.throws(() => validateWorldPlanPreferences(invalid), /road width/);
});

test("world-plan metadata and semantic regions are stored in the document", () => {
  const structure: VoxelStructure = { name: "empty", size: [0, 0, 0], blocks: [] };
  const plan = createLocalWorldPlan(prompt, 42);
  const document = setWorldPlan(createBuildingDocument(structure), plan, { provider: "local", prompt, seed: 42, planVersion: 1 });
  assert.equal(document.worldPlan?.id, plan.id);
  assert.equal(document.worldPlanMetadata?.seed, 42);
  assert.deepEqual(document.semanticRegions, plan.regions);
});
