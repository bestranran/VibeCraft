import assert from "node:assert/strict";
import test from "node:test";
import { acceptPendingEdit, createBuildingDocument, redoDocument, setPendingEdit, undoDocument } from "../lib/building-document";
import { applyBuildingOperations } from "../lib/building-operations";
import { generateStructure } from "../lib/generator";
import { parseEditCommand } from "../lib/local-edit-parser";

test("accept, undo and redo preserve immutable snapshots", () => {
  const initial = generateStructure("medieval cottage");
  const operations = parseEditCommand("把屋顶加高两层", initial);
  const result = applyBuildingOperations(initial, operations);
  const pending = { prompt: "把屋顶加高两层", operations, patch: result.patch, preview: result.structure };
  const accepted = acceptPendingEdit(setPendingEdit(createBuildingDocument(initial), pending), { id: "test", createdAt: 1 });
  assert.equal(accepted.history.length, 1);
  assert.deepEqual(undoDocument(accepted).structure, initial);
  assert.deepEqual(redoDocument(undoDocument(accepted)).structure, result.structure);
});

test("accepting a new edit clears redo history", () => {
  const initial = generateStructure("medieval cottage");
  const roofOps = parseEditCommand("把屋顶加高两层", initial);
  const roof = applyBuildingOperations(initial, roofOps);
  const accepted = acceptPendingEdit(setPendingEdit(createBuildingDocument(initial), { prompt: "roof", operations: roofOps, patch: roof.patch, preview: roof.structure }), { id: "one", createdAt: 1 });
  const undone = undoDocument(accepted);
  const windowOps = parseEditCommand("增加窗户", undone.structure);
  const windows = applyBuildingOperations(undone.structure, windowOps);
  const next = acceptPendingEdit(setPendingEdit(undone, { prompt: "windows", operations: windowOps, patch: windows.patch, preview: windows.structure }), { id: "two", createdAt: 2 });
  assert.equal(next.future.length, 0);
});
