import assert from "node:assert/strict";
import test from "node:test";
import { BUILD_SCRIPT_COMPILER_VERSION, compileBuildScript } from "../lib/build-script-compiler";
import { applyBuildingOperations } from "../lib/building-operations";
import {
  acceptPendingEdit,
  createBuildingDocument,
  redoDocument,
  rejectPendingEdit,
  setPendingEdit,
  undoDocument
} from "../lib/building-document";
import { parseEditCommand } from "../lib/local-edit-parser";
import type { GenerationMetadata } from "../lib/structure";

function generatedFixture() {
  return compileBuildScript({
    version: 1,
    name: "editable-buildscript-house",
    bounds: { width: 64, depth: 64, maxHeight: 64 },
    palette: {
      base: "minecraft:stone_bricks",
      wall: "minecraft:oak_planks",
      roof: "minecraft:spruce_planks",
      glass: "minecraft:glass_pane"
    },
    operations: [
      { type: "foundation", id: "base", origin: [18, 0, 18], size: [20, 1, 18], material: "base" },
      { type: "hollowBox", id: "house", origin: [20, 1, 20], size: [16, 8, 14], wall: "wall", floor: "base" },
      { type: "gableRoof", id: "roof", target: "house", height: 4, overhang: 1, material: "roof" },
      { type: "entrance", id: "door", target: "house", side: "front", width: 2, height: 3 }
    ]
  });
}

function metadataFor(compilation = generatedFixture()): GenerationMetadata {
  return {
    prompt: "Build an editable cottage",
    seed: 12345,
    provider: "deepseek-buildscript",
    compilerVersion: BUILD_SCRIPT_COMPILER_VERSION,
    buildScript: compilation.script,
    operationCount: compilation.stats.operationCount,
    blockCount: compilation.stats.blockCount,
    validationWarnings: compilation.validation.diagnostics.filter((item) => item.severity === "warning").map((item) => item.message)
  };
}

test("generated BuildScript metadata is deeply stored with a fresh project document", () => {
  const compilation = generatedFixture();
  const metadata = metadataFor(compilation);
  const document = createBuildingDocument(compilation.structure, { generationMetadata: metadata });
  assert.deepEqual(document.generationMetadata, metadata);
  assert.notEqual(document.generationMetadata, metadata);
  assert.notEqual(document.generationMetadata?.buildScript, metadata.buildScript);
  assert.equal(document.history.length, 0);
  assert.equal(document.future.length, 0);
  assert.equal(document.pendingEdit, null);

  metadata.validationWarnings.push("external mutation");
  if (metadata.buildScript) metadata.buildScript.palette.wall = "minecraft:brick";
  assert.equal(document.generationMetadata?.validationWarnings.includes("external mutation"), false);
  assert.equal(document.generationMetadata?.buildScript?.palette.wall, "minecraft:oak_planks");
});

test("a generated structure supports preview, reject, accept, undo, and redo without losing metadata or owners", () => {
  const compilation = generatedFixture();
  const metadata = metadataFor(compilation);
  const initial = createBuildingDocument(compilation.structure, { generationMetadata: metadata });
  const operations = parseEditCommand("增加窗户", initial.structure);
  const edit = applyBuildingOperations(initial.structure, operations);
  const pending = setPendingEdit(initial, { prompt: "增加窗户", operations, patch: edit.patch, preview: edit.structure });

  assert.deepEqual(pending.structure, initial.structure);
  assert.notDeepEqual(pending.pendingEdit?.preview, initial.structure);
  const rejected = rejectPendingEdit(pending);
  assert.deepEqual(rejected.structure, initial.structure);
  assert.deepEqual(rejected.generationMetadata, initial.generationMetadata);
  assert.equal(rejected.history.length, 0);

  const accepted = acceptPendingEdit(pending, { id: "generated-edit", createdAt: 1 });
  assert.deepEqual(accepted.structure, edit.structure);
  assert.deepEqual(accepted.generationMetadata, initial.generationMetadata);
  assert.equal(accepted.history.length, 1);
  assert.ok(accepted.structure.blocks.every((block) => block.ownerId));
  assert.ok(accepted.structure.blocks.some((block) => block.ownerId === "roof"));

  const undone = undoDocument(accepted);
  assert.deepEqual(undone.structure, initial.structure);
  assert.deepEqual(undone.generationMetadata, initial.generationMetadata);
  assert.equal(undone.future.length, 1);

  const redone = redoDocument(undone);
  assert.deepEqual(redone.structure, edit.structure);
  assert.deepEqual(redone.generationMetadata, initial.generationMetadata);
  assert.ok(redone.structure.blocks.every((block) => block.ownerId));
});

test("generation and edit failures leave the current document byte-for-byte unchanged", () => {
  const compilation = generatedFixture();
  const current = createBuildingDocument(compilation.structure, { generationMetadata: metadataFor(compilation) });
  const snapshot = structuredClone(current);

  assert.throws(() => compileBuildScript({
    ...compilation.script,
    operations: [{ type: "hollowBox", id: "outside", origin: [63, 1, 63], size: [8, 8, 8], wall: "wall" }]
  }), /outside/);
  assert.throws(() => parseEditCommand("make the building sing a song", current.structure), /could not map|couldn't (?:map|understand)/i);
  assert.deepEqual(current, snapshot);
});
