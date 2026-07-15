import assert from "node:assert/strict";
import test from "node:test";
import { assessAgentBuild, normalizeAgentMaterial, parseCompactStage } from "../lib/deepseek-voxel-agent";
import type { VoxelBlock, VoxelStructure } from "../lib/structure";

function structure(blocks: VoxelBlock[]): VoxelStructure {
  return { name: "fixture", size: [0, 0, 0], blocks };
}

test("agent assessment recognizes one connected hollow shell", () => {
  const blocks: VoxelBlock[] = [];
  for (let y = 0; y <= 3; y += 1) for (let x = 0; x <= 4; x += 1) for (let z = 0; z <= 4; z += 1) {
    if (y === 0 || x === 0 || x === 4 || z === 0 || z === 4) blocks.push({ x, y, z, id: y === 0 ? "minecraft:stone_bricks" : "minecraft:oak_planks" });
  }
  blocks.push({ x: 0, y: 4, z: 0, id: "minecraft:spruce_stairs" });
  const result = assessAgentBuild(structure(blocks));
  assert.equal(result.connectedRatio, 1);
  assert.ok(result.density < 0.72);
  assert.equal(result.warnings.length, 0);
});

test("agent assessment flags disconnected and overly solid geometry", () => {
  const blocks: VoxelBlock[] = [];
  for (let x=0;x<4;x+=1) for(let y=0;y<4;y+=1) for(let z=0;z<4;z+=1) blocks.push({ x,y,z,id:"minecraft:brick" });
  blocks.push({ x: 10, y: 10, z: 10, id: "minecraft:cobblestone" });
  const result = assessAgentBuild(structure(blocks));
  assert.ok(result.warnings.some((warning) => warning.includes("disconnected")));
  assert.ok(result.warnings.some((warning) => warning.includes("palette")));
});

test("compact DeepSeek tool DSL expands into validated voxel calls", () => {
  const stage = parseCompactStage({ summary: "shell", toolCalls: [
    ["F", 10, 0, 10, 20, 0, 20, "minecraft:stone_bricks", "foundation"],
    ["D", 14, 1, 10, 16, 3, 10],
    ["L", 10, 4, 10, 20, 4, 10, "minecraft:oak_log", "trim"]
  ] });
  assert.equal(stage.toolCalls.length, 3);
  assert.equal(stage.toolCalls[0].type, "fill");
  assert.equal(stage.toolCalls[1].type, "remove");
  assert.throws(() => parseCompactStage({ toolCalls: [["F", 0, 0]] }), /material|integer/);
});

test("agent materials accept cyberpunk blocks and normalize common aliases", () => {
  assert.equal(normalizeAgentMaterial("minecraft:cyan_concrete"), "minecraft:cyan_concrete");
  assert.equal(normalizeAgentMaterial("steel_block"), "minecraft:iron_block");
  assert.equal(normalizeAgentMaterial("minecraft:purple_concrete"), "minecraft:magenta_concrete");
  assert.equal(normalizeAgentMaterial("glowstone"), "minecraft:sea_lantern");
  assert.throws(() => normalizeAgentMaterial("mod:diamond_block"), /Unsupported agent material/);
});
