import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekVoxelEditPlanner, parseVoxelEditPlan, VoxelEditPlanningError } from "../lib/deepseek-voxel-edit-planner";
import { createVoxelEditContext } from "../lib/voxel-edit-context";
import type { VoxelStructure } from "../lib/structure";

const robot: VoxelStructure = {
  name: "robot",
  size: [3, 3, 3],
  blocks: [
    { x: 20, y: 5, z: 20, id: "minecraft:iron_block", ownerId: "torso" },
    { x: 17, y: 5, z: 20, id: "minecraft:yellow_concrete", ownerId: "left-arm" },
    { x: 23, y: 5, z: 20, id: "minecraft:cyan_concrete", ownerId: "right-arm" }
  ]
};
const context = createVoxelEditContext(robot);

test("voxel edit plans validate generic calls and declared component scope", () => {
  const plan = parseVoxelEditPlan(JSON.stringify({
    summary: "Thicken the left arm",
    affectedOwnerIds: ["left-arm"],
    toolCalls: [{ type: "fill", from: [16, 5, 20], to: [18, 6, 20], material: "minecraft:yellow_concrete", ownerId: "left-arm", mode: "empty" }]
  }), context);
  assert.equal(plan.toolCalls[0].type, "fill");
  assert.deepEqual(plan.affectedOwnerIds, ["left-arm"]);
  assert.throws(() => parseVoxelEditPlan(JSON.stringify({ summary: "bad", affectedOwnerIds: ["roof"], toolCalls: [{ type: "remove", from: [1, 1, 1], to: [1, 1, 1] }] }), context), /unknown component/);
  assert.throws(() => parseVoxelEditPlan("not json", context), VoxelEditPlanningError);
});

test("DeepSeek planner makes exactly one repair attempt for invalid response format", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const content = calls === 1
      ? "{invalid"
      : JSON.stringify({ summary: "Remove the left arm tip", affectedOwnerIds: ["left-arm"], toolCalls: [{ type: "remove", from: [17, 5, 20], to: [17, 5, 20] }] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await new DeepSeekVoxelEditPlanner("test-key", "test-model", "https://example.test").planEdit("shorten the left arm", context);
    assert.equal(calls, 2);
    assert.equal(result.repaired, true);
    assert.equal(result.toolCalls[0].type, "remove");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider failures do not trigger the format-repair request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };
  try {
    await assert.rejects(
      () => new DeepSeekVoxelEditPlanner("test-key", "test-model", "https://example.test").planEdit("edit", context),
      /failed \(503\)/
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
