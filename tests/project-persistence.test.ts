import assert from "node:assert/strict";
import test from "node:test";
import { acceptPendingEdit, createBuildingDocument, redoDocument, setPendingEdit, undoDocument } from "../lib/building-document";
import { normalizeStructure } from "../lib/patches";
import {
  clearSavedProject,
  loadProject,
  PROJECT_STORAGE_KEY,
  ProjectPersistenceError,
  restoreProject,
  saveProject,
  serializeProject
} from "../lib/project-persistence";
import type { BuildingDocument, GenerationMetadata, VoxelStructure, VoxelToolCall } from "../lib/structure";
import { createVoxelToolPendingEdit, executeVoxelTools } from "../lib/voxel-tools";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function initialStructure(): VoxelStructure {
  return normalizeStructure({
    name: "persistent-robot",
    size: [0, 0, 0],
    blocks: [
      { x: 20, y: 4, z: 20, id: "minecraft:iron_block", ownerId: "torso" },
      { x: 19, y: 5, z: 20, id: "minecraft:yellow_concrete", ownerId: "left-arm" }
    ]
  });
}

function metadata(structure: VoxelStructure): GenerationMetadata {
  return {
    prompt: "a persistent robot",
    seed: 42,
    provider: "local",
    compilerVersion: "fixture-v1",
    operationCount: 0,
    blockCount: structure.blocks.length,
    validationWarnings: []
  };
}

function documentWithHistoryAndFuture() {
  const initial = initialStructure();
  let document = createBuildingDocument(initial, {
    generationMetadata: metadata(initial),
    semanticRegions: [{ id: "protected-core", locked: true, bounds: { minX: 20, minY: 4, minZ: 20, maxX: 20, maxY: 4, maxZ: 20 } }]
  });
  const firstCalls: VoxelToolCall[] = [{ type: "fill", from: [18, 5, 20], to: [18, 6, 20], material: "minecraft:yellow_concrete", ownerId: "left-arm", mode: "empty" }];
  const first = executeVoxelTools(document.structure, firstCalls);
  document = acceptPendingEdit(setPendingEdit(document, createVoxelToolPendingEdit("thicken left arm", first, firstCalls)), { id: "edit-one", createdAt: 100 });
  const secondCalls: VoxelToolCall[] = [{ type: "replace", from: [18, 5, 20], to: [19, 6, 20], fromMaterial: "minecraft:yellow_concrete", toMaterial: "minecraft:cyan_concrete", ownerId: "left-arm" }];
  const second = executeVoxelTools(document.structure, secondCalls);
  document = acceptPendingEdit(setPendingEdit(document, createVoxelToolPendingEdit("make the arm blue", second, secondCalls)), { id: "edit-two", createdAt: 200 });
  return { initial, final: document.structure, undone: undoDocument(document) };
}

test("refresh restoration preserves the accepted project and lossless undo/redo stacks", () => {
  const { initial, final, undone } = documentWithHistoryAndFuture();
  const restored = restoreProject(serializeProject(undone, 1234));
  assert.equal(restored.savedAt, 1234);
  assert.equal(restored.pendingEditDiscarded, false);
  assert.deepEqual(restored.document.structure, undone.structure);
  assert.deepEqual(restored.document.generationMetadata, undone.generationMetadata);
  assert.deepEqual(restored.document.semanticRegions, undone.semanticRegions);
  assert.deepEqual(restored.document.history, undone.history);
  assert.deepEqual(restored.document.future, undone.future);

  const backToInitial = undoDocument(restored.document);
  assert.deepEqual(backToInitial.structure, initial);
  const firstRedone = redoDocument(backToInitial);
  assert.deepEqual(firstRedone.structure, undone.structure);
  const secondRedone = redoDocument(firstRedone);
  assert.deepEqual(secondRedone.structure, final);
});

test("a persisted pending preview is validated then explicitly discarded on refresh", () => {
  const accepted = createBuildingDocument(initialStructure());
  const calls: VoxelToolCall[] = [{ type: "remove", from: [19, 5, 20], to: [19, 5, 20] }];
  const execution = executeVoxelTools(accepted.structure, calls);
  const withPending = setPendingEdit(accepted, createVoxelToolPendingEdit("remove arm", execution, calls));
  const restored = restoreProject(serializeProject(withPending, 500));
  assert.equal(restored.pendingEditDiscarded, true);
  assert.equal(restored.document.pendingEdit, null);
  assert.deepEqual(restored.document.structure, accepted.structure);
  assert.notDeepEqual(restored.document.structure, execution.structure);
});

test("snapshots compact history by storing patches instead of duplicate structure copies", () => {
  const { undone } = documentWithHistoryAndFuture();
  const snapshot = JSON.parse(serializeProject(undone, 1)) as { document: { history: Array<Record<string, unknown>>; future: Array<Record<string, unknown>> } };
  assert.equal("before" in snapshot.document.history[0], false);
  assert.equal("after" in snapshot.document.history[0], false);
  assert.equal("before" in snapshot.document.future[0], false);
  assert.equal("after" in snapshot.document.future[0], false);
  assert.ok("patch" in snapshot.document.history[0]);
});

test("corrupted, incompatible, and internally inconsistent saves return a recovery result", () => {
  const storage = new MemoryStorage();
  storage.setItem(PROJECT_STORAGE_KEY, "{broken");
  const corrupt = loadProject(storage);
  assert.equal(corrupt.status, "invalid");
  assert.match(corrupt.status === "invalid" ? corrupt.message : "", /invalid JSON/);

  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ version: 99, savedAt: 1, document: {} }));
  const incompatible = loadProject(storage);
  assert.equal(incompatible.status, "invalid");
  assert.match(incompatible.status === "invalid" ? incompatible.message : "", /not supported/);

  const accepted = createBuildingDocument(initialStructure());
  const calls: VoxelToolCall[] = [{ type: "remove", from: [19, 5, 20], to: [19, 5, 20] }];
  const pending = setPendingEdit(accepted, createVoxelToolPendingEdit("remove arm", executeVoxelTools(accepted.structure, calls), calls));
  const tampered = JSON.parse(serializeProject(pending, 1)) as { document: { pendingEdit: { patch: { changes: Array<{ block: { id: string } }> } } } };
  tampered.document.pendingEdit.patch.changes[0].block.id = "minecraft:bricks";
  assert.throws(() => restoreProject(JSON.stringify(tampered)), /mismatched coordinate/);
});

test("saving and clearing use only project-local storage and never include the API key", () => {
  const storage = new MemoryStorage();
  const document = createBuildingDocument(initialStructure(), { generationMetadata: metadata(initialStructure()) });
  saveProject(storage, document, 99);
  const serialized = storage.getItem(PROJECT_STORAGE_KEY);
  assert.ok(serialized);
  assert.equal(serialized?.includes("deepseekApiKey"), false);
  assert.equal(serialized?.includes("session-secret-123"), false);
  assert.equal(loadProject(storage).status, "restored");

  clearSavedProject(storage);
  assert.equal(storage.getItem(PROJECT_STORAGE_KEY), null);
  saveProject(storage, createBuildingDocument({ name: "empty", size: [0, 0, 0], blocks: [] }));
  assert.equal(storage.getItem(PROJECT_STORAGE_KEY), null);
});

test("storage write failures are surfaced without changing the project document", () => {
  const original = createBuildingDocument(initialStructure());
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error("quota exceeded"); },
    removeItem: () => undefined
  };
  assert.throws(() => saveProject(storage, original), ProjectPersistenceError);
  assert.deepEqual(original.structure, initialStructure());
});
