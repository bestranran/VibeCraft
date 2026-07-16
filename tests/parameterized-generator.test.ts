import assert from "node:assert/strict";
import test from "node:test";
import { generateFromSpec } from "../lib/parameterized-generator";
import { validateBuildingSpec } from "../lib/building-spec";

const spec = validateBuildingSpec({
  name: "cozy forest inn", style: "medieval", width: 12, depth: 8, floors: 2, wallHeight: 7,
  roof: { type: "gable", height: 5, overhang: 1 }, features: ["chimney", "porch", "path", "lanterns"],
  palette: { foundation: "minecraft:stone_bricks", walls: "minecraft:oak_planks", roof: "minecraft:spruce_stairs", accent: "minecraft:oak_log" }
});

test("building spec is bounded and normalized to odd dimensions", () => {
  assert.equal(spec.width % 2, 1);
  assert.equal(spec.depth % 2, 1);
  assert.ok(spec.width >= 7 && spec.width <= 17);
});

test("parameterized building is hollow, enterable, and has a continuous roof", () => {
  const structure = generateFromSpec(spec);
  const occupied = new Set(structure.blocks.map((block) => `${block.x},${block.y},${block.z}`));
  const hz = Math.floor(spec.depth / 2);
  assert.equal(occupied.has(`0,1,${-hz}`), false);
  assert.equal(occupied.has("0,2,0"), false);
  const roofY = Array.from(new Set(structure.blocks.filter((block) => block.id === spec.palette.roof).map((block) => block.y))).sort((a,b) => a-b);
  assert.ok(roofY.every((y, index) => index === 0 || y <= roofY[index - 1] + 1));
  assert.ok(structure.blocks.some((block) => block.id === "minecraft:bricks"));
});
