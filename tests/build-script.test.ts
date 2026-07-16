import assert from "node:assert/strict";
import test from "node:test";
import { BuildScriptCompileError, compileBuildScript } from "../lib/build-script-compiler";
import { BuildScriptValidationError, validateBuildScript } from "../lib/build-script";

const gableFixture = {
  version: 1,
  name: "Japanese house",
  bounds: { width: 64, depth: 64, maxHeight: 64 },
  palette: {
    foundation: "minecraft:stone_bricks",
    walls: "minecraft:oak_planks",
    roof: "minecraft:spruce_planks"
  },
  operations: [
    {
      type: "foundation",
      id: "stone-base",
      origin: [18, 0, 20],
      size: [22, 1, 18],
      material: "foundation"
    },
    {
      type: "hollowBox",
      id: "main-house",
      origin: [20, 1, 22],
      size: [18, 8, 14],
      wall: "walls",
      floor: "foundation"
    },
    {
      type: "gableRoof",
      id: "main-roof",
      target: "main-house",
      height: 5,
      overhang: 2,
      material: "roof"
    }
  ]
};

test("BuildScript validation resolves palette references and normalizes defaults", () => {
  const script = validateBuildScript(gableFixture);
  assert.equal(script.operations[0].type, "foundation");
  if (script.operations[0].type === "foundation") {
    assert.equal(script.operations[0].material, "minecraft:stone_bricks");
  }
  assert.equal(script.operations[2].type, "gableRoof");
  if (script.operations[2].type === "gableRoof") {
    assert.equal(script.operations[2].material, "minecraft:spruce_planks");
    assert.equal(script.operations[2].ridgeAxis, "x");
  }
});

test("syntactically valid vanilla materials are accepted beyond the preview defaults", () => {
  const script = validateBuildScript({
    ...gableFixture,
    palette: { ...gableFixture.palette, walls: "minecraft:red_concrete" }
  });
  assert.equal(script.palette.walls, "minecraft:red_concrete");
  const wall = script.operations.find((operation) => operation.type === "hollowBox");
  assert.equal(wall?.type === "hollowBox" ? wall.wall : undefined, "minecraft:red_concrete");
});

test("the same BuildScript deterministically compiles to a hollow owned structure", () => {
  const first = compileBuildScript(gableFixture);
  const second = compileBuildScript(structuredClone(gableFixture));
  assert.deepEqual(first, second);
  assert.equal(first.stats.operationCount, 3);
  assert.equal(first.reports.length, 3);
  assert.ok(first.structure.blocks.length > 0);
  assert.equal(new Set(first.structure.blocks.map((block) => `${block.x},${block.y},${block.z}`)).size, first.structure.blocks.length);
  assert.ok(first.structure.blocks.every((block) => block.ownerId));
  assert.ok(first.structure.blocks.some((block) => block.ownerId === "main-roof"));

  const roof = first.structure.blocks.filter((block) => block.ownerId === "main-roof");
  const roofCoordinates = new Set(roof.map((block) => `${block.x},${block.y},${block.z}`));
  const visited = new Set<string>();
  const pending = roof.length ? [[roof[0].x, roof[0].y, roof[0].z]] : [];
  while (pending.length) {
    const [x, y, z] = pending.pop()!;
    const key = `${x},${y},${z}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const neighbor = `${x + dx},${y + dy},${z + dz}`;
      if (roofCoordinates.has(neighbor) && !visited.has(neighbor)) pending.push([x + dx, y + dy, z + dz]);
    }
  }
  assert.equal(visited.size, roof.length);

  const interior = first.structure.blocks.find((block) => block.x === 24 && block.y === 3 && block.z === 26);
  assert.equal(interior, undefined);
  const wall = first.structure.blocks.find((block) => block.x === 20 && block.y === 3 && block.z === 26);
  assert.equal(wall?.ownerId, "main-house");
});

test("flat roofs derive their bounds from the target component", () => {
  const result = compileBuildScript({
    ...gableFixture,
    name: "Modern villa",
    operations: [
      {
        type: "hollowBox",
        id: "villa",
        origin: [10, 2, 12],
        size: [12, 6, 10],
        wall: "walls",
        floor: "foundation"
      },
      {
        type: "flatRoof",
        id: "villa-roof",
        target: "villa",
        overhang: 1,
        thickness: 2,
        material: "minecraft:gray_concrete"
      }
    ]
  });
  const roof = result.structure.blocks.filter((block) => block.ownerId === "villa-roof");
  assert.ok(roof.some((block) => block.x === 9 && block.y === 8 && block.z === 11));
  assert.ok(roof.some((block) => block.x === 22 && block.y === 9 && block.z === 22));
  assert.equal(result.reports[1].added, 14 * 12 * 2);
});

test("invalid materials, references, dimensions, and scene bounds are rejected before execution", () => {
  assert.throws(() => validateBuildScript({
    ...gableFixture,
    palette: { walls: "mod:diamond_block" }
  }), BuildScriptValidationError);

  assert.throws(() => validateBuildScript({
    ...gableFixture,
    operations: [{
      type: "gableRoof", id: "roof", target: "missing", height: 3, material: "roof"
    }]
  }), /missing or later component/);

  assert.throws(() => validateBuildScript({
    ...gableFixture,
    operations: [{
      type: "hollowBox", id: "tiny", origin: [1, 1, 1], size: [2, 1, 2], wall: "walls"
    }]
  }), /must be an integer from 3 to 128/);

  assert.throws(() => validateBuildScript({
    ...gableFixture,
    operations: [{
      type: "hollowBox", id: "edge", origin: [0, 1, 0], size: [10, 5, 10], wall: "walls"
    }, {
      type: "gableRoof", id: "roof", target: "edge", height: 3, overhang: 1, material: "roof"
    }]
  }), /extends outside/);
});

test("operation, tool-call, coordinate, and changed-block budgets are enforced", () => {
  assert.throws(() => validateBuildScript(gableFixture, { maxOperations: 2 }), /operation budget/);
  assert.throws(() => compileBuildScript(gableFixture, { maxToolCalls: 2 }), BuildScriptCompileError);
  assert.throws(() => compileBuildScript(gableFixture, { maxCoordinates: 10 }), /coordinate budget/);
  assert.throws(() => compileBuildScript(gableFixture, { maxChangedBlocks: 10 }), /changed-block budget/);
});

const completeFixture = {
  version: 1,
  name: "Complete cottage",
  bounds: { width: 64, depth: 64, maxHeight: 64 },
  palette: {
    base: "minecraft:stone_bricks",
    wall: "minecraft:oak_planks",
    roof: "minecraft:spruce_planks",
    glass: "minecraft:glass_pane",
    path: "minecraft:cobblestone"
  },
  operations: [
    { type: "foundation", id: "base", origin: [18, 0, 18], size: [18, 1, 16], material: "base" },
    { type: "hollowBox", id: "house", origin: [20, 1, 20], size: [14, 8, 12], wall: "wall", floor: "base" },
    { type: "gableRoof", id: "roof", target: "house", height: 4, overhang: 1, material: "roof" },
    { type: "entrance", id: "front-door", target: "house", side: "front", width: 2, height: 3 },
    { type: "windows", id: "windows", target: "house", side: "all", count: 2, width: 1, height: 2, sillHeight: 2, material: "glass" },
    { type: "porch", id: "porch", target: "house", side: "front", width: 6, depth: 2, material: "base" },
    { type: "path", id: "front-path", target: "front-door", length: 8, width: 3, material: "path" }
  ]
};

test("entrances, windows, porches, and paths compile from target geometry without collisions", () => {
  const result = compileBuildScript(completeFixture);
  assert.equal(result.validation.valid, true, result.validation.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.validation.metrics.entranceCount, 1);
  assert.equal(result.validation.metrics.floatingComponents, 0);
  assert.equal(result.validation.metrics.hollowInteriorRatio, 1);

  const doorBlocks = result.structure.blocks.filter((block) => block.x >= 26 && block.x <= 27 && block.z === 20 && block.y >= 2 && block.y <= 4);
  assert.equal(doorBlocks.length, 0);
  const glass = result.structure.blocks.filter((block) => block.ownerId === "windows");
  assert.ok(glass.length >= 8);
  assert.ok(glass.every((block) => block.id === "minecraft:glass_pane"));
  assert.ok(glass.every((block) => !(block.z === 20 && block.x >= 26 && block.x <= 27)));
  assert.ok(result.structure.blocks.some((block) => block.ownerId === "porch"));
  assert.ok(result.structure.blocks.some((block) => block.ownerId === "front-path" && block.z === 12));
});

test("solid and hollow cylinders remain bounded and deterministic", () => {
  const script = {
    version: 1,
    name: "Twin towers",
    bounds: { width: 64, depth: 64, maxHeight: 64 },
    palette: { stone: "minecraft:sandstone", accent: "minecraft:red_sandstone" },
    operations: [
      { type: "cylinder", id: "solid-tower", origin: [12, 0, 12], radius: 3, height: 7, material: "stone" },
      { type: "cylinder", id: "hollow-tower", origin: [28, 0, 12], radius: 4, height: 8, material: "accent", hollow: true }
    ]
  };
  const result = compileBuildScript(script);
  assert.deepEqual(result, compileBuildScript(structuredClone(script)));
  assert.ok(result.structure.blocks.some((block) => block.x === 12 && block.y === 4 && block.z === 12));
  assert.equal(result.structure.blocks.some((block) => block.x === 28 && block.y === 4 && block.z === 12), false);
  assert.ok(result.structure.blocks.some((block) => block.x === 28 && block.y === 0 && block.z === 12));
  assert.ok(result.structure.blocks.every((block) => block.x >= 0 && block.x < 128 && block.y >= 0 && block.y < 128 && block.z >= 0 && block.z < 128));
});

test("copyMirror uses a source snapshot and preserves semantic ownership", () => {
  const script = {
    version: 1,
    name: "Mirrored pylons",
    bounds: { width: 64, depth: 64, maxHeight: 64 },
    palette: { metal: "minecraft:iron_block" },
    operations: [
      { type: "cylinder", id: "pylon", origin: [12, 0, 16], radius: 2, height: 5, material: "metal" },
      { type: "copyMirror", id: "pylon-mirror", target: "pylon", mode: "mirror", axis: "x", pivot: 20 }
    ]
  };
  const result = compileBuildScript(script);
  const original = result.structure.blocks.filter((block) => block.x < 20);
  const mirrored = result.structure.blocks.filter((block) => block.x > 20);
  assert.equal(mirrored.length, original.length);
  assert.ok(mirrored.every((block) => block.ownerId === "pylon"));
  assert.deepEqual(result, compileBuildScript(structuredClone(script)));
  assert.throws(() => validateBuildScript({
    ...script,
    operations: [script.operations[0], { type: "copyMirror", id: "outside", target: "pylon", mode: "copy", offset: [-20, 0, 0] }]
  }), /extends outside/);
});

test("medieval, Japanese, desert, modern, and cyberpunk fixtures compile into valid distinct buildings", () => {
  const styles = [
    ["Medieval cottage", "minecraft:cobblestone", "minecraft:oak_planks", "minecraft:spruce_planks", "gableRoof"],
    ["Japanese house", "minecraft:stone_bricks", "minecraft:dark_oak_planks", "minecraft:spruce_planks", "gableRoof"],
    ["Desert tower", "minecraft:red_sandstone", "minecraft:sandstone", "minecraft:red_sandstone", "flatRoof"],
    ["Modern villa", "minecraft:stone_bricks", "minecraft:gray_concrete", "minecraft:iron_block", "flatRoof"],
    ["Cyberpunk shop", "minecraft:black_concrete", "minecraft:cyan_concrete", "minecraft:magenta_concrete", "flatRoof"]
  ] as const;
  const silhouettes = new Set<string>();
  for (const [name, base, wall, roof, roofType] of styles) {
    const operations: Record<string, unknown>[] = [
      { type: "foundation", id: "base", origin: [18, 0, 18], size: [20, 1, 18], material: "base" },
      { type: "hollowBox", id: "main", origin: [20, 1, 20], size: name === "Desert tower" ? [10, 12, 10] : name === "Modern villa" ? [16, 7, 12] : [14, 8, 12], wall: "wall", floor: "base" },
      roofType === "gableRoof"
        ? { type: roofType, id: "roof", target: "main", height: name === "Japanese house" ? 5 : 4, overhang: name === "Japanese house" ? 2 : 1, material: "roof" }
        : { type: roofType, id: "roof", target: "main", overhang: name === "Cyberpunk shop" ? 1 : 0, thickness: name === "Cyberpunk shop" ? 2 : 1, material: "roof" },
      { type: "entrance", id: "door", target: "main", side: "front", width: 2, height: 3 },
      { type: "windows", id: "glass", target: "main", side: name === "Modern villa" ? "all" : "front", count: name === "Modern villa" ? 3 : 2, material: "glass" }
    ];
    if (name === "Japanese house") operations.push({ type: "porch", id: "veranda", target: "main", side: "front", width: 8, depth: 2, material: "base" });
    if (name === "Cyberpunk shop") operations.push({ type: "path", id: "walkway", target: "door", length: 5, width: 3, material: "roof" });
    const result = compileBuildScript({
      version: 1,
      name,
      bounds: { width: 64, depth: 64, maxHeight: 64 },
      palette: { base, wall, roof, glass: "minecraft:glass_pane" },
      operations
    });
    assert.equal(result.validation.valid, true, `${name}: ${result.validation.diagnostics.map((item) => item.message).join("; ")}`);
    silhouettes.add(`${result.structure.size.join("x")}:${result.structure.blocks.length}`);
  }
  assert.ok(silhouettes.size >= 4);
});

test("semantic structure diagnostics remain advisory and do not force a building template", () => {
  const result = compileBuildScript({
    version: 1,
    name: "Unsafe shell",
    bounds: { width: 64, depth: 64, maxHeight: 64 },
    palette: { wall: "minecraft:oak_planks", roof: "minecraft:spruce_planks" },
    operations: [
      { type: "hollowBox", id: "floating-house", origin: [20, 4, 20], size: [10, 6, 10], wall: "wall" },
      { type: "flatRoof", id: "roof", target: "floating-house", material: "roof" }
    ]
  });
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.diagnostics.some((item) => item.code === "MISSING_ENTRANCE"), false);
  assert.ok(result.validation.diagnostics.some((item) => item.code === "FLOATING_COMPONENT" && item.severity === "warning"));
});
