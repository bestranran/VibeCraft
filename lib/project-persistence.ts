import { validateBuildScript } from "./build-script";
import { validateBuildingOperations } from "./operation-validation";
import { calculateStructureSize, coordinateKey, invertPatch, normalizeStructure } from "./patches";
import { MAX_STRUCTURE_BLOCKS, SCENE_MAX_COORDINATE, SCENE_SIZE, isBlockId } from "./structure";
import type {
  BlockChange,
  Box3D,
  BuildingDocument,
  BuildingOperation,
  EditTransaction,
  GenerationMetadata,
  PendingEdit,
  SemanticRegion,
  StructurePatch,
  VoxelBlock,
  VoxelStructure,
  VoxelToolCall,
  WorldPlanMetadata
} from "./structure";
import { validateVoxelToolCalls } from "./voxel-tools";
import { validateWorldPlan } from "./world-planner";

export const PROJECT_STORAGE_KEY = "vibecraft.project.v1";
export const PROJECT_SNAPSHOT_VERSION = 1;

export type ProjectStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type CompactTransaction = Omit<EditTransaction, "before" | "after">;
type CompactPendingEdit = Omit<PendingEdit, "preview">;

type ProjectSnapshotV1 = {
  version: 1;
  savedAt: number;
  document: {
    structure: VoxelStructure;
    generationMetadata?: GenerationMetadata;
    worldPlan?: BuildingDocument["worldPlan"];
    worldPlanMetadata?: WorldPlanMetadata;
    semanticRegions: SemanticRegion[];
    history: CompactTransaction[];
    future: CompactTransaction[];
    pendingEdit: CompactPendingEdit | null;
  };
};

export type ProjectLoadResult =
  | { status: "empty" }
  | { status: "restored"; document: BuildingDocument; savedAt: number; pendingEditDiscarded: boolean }
  | { status: "invalid"; message: string };

export class ProjectPersistenceError extends Error {}

export function serializeProject(document: BuildingDocument, savedAt = Date.now()): string {
  const snapshot: ProjectSnapshotV1 = {
    version: PROJECT_SNAPSHOT_VERSION,
    savedAt,
    document: {
      structure: document.structure,
      ...(document.generationMetadata ? { generationMetadata: document.generationMetadata } : {}),
      ...(document.worldPlan ? { worldPlan: document.worldPlan } : {}),
      ...(document.worldPlanMetadata ? { worldPlanMetadata: document.worldPlanMetadata } : {}),
      semanticRegions: document.semanticRegions,
      history: document.history.map(compactTransaction),
      future: document.future.map(compactTransaction),
      pendingEdit: document.pendingEdit ? {
        prompt: document.pendingEdit.prompt,
        operations: document.pendingEdit.operations,
        ...(document.pendingEdit.toolCalls ? { toolCalls: document.pendingEdit.toolCalls } : {}),
        patch: document.pendingEdit.patch
      } : null
    }
  };
  return JSON.stringify(snapshot);
}

export function saveProject(storage: ProjectStorage, document: BuildingDocument, savedAt = Date.now()) {
  try {
    if (!document.structure.blocks.length) {
      storage.removeItem(PROJECT_STORAGE_KEY);
      return;
    }
    storage.setItem(PROJECT_STORAGE_KEY, serializeProject(document, savedAt));
  } catch (error) {
    throw new ProjectPersistenceError(error instanceof Error ? `The project could not be saved locally: ${error.message}` : "The project could not be saved locally.");
  }
}

export function clearSavedProject(storage: ProjectStorage) {
  try {
    storage.removeItem(PROJECT_STORAGE_KEY);
  } catch (error) {
    throw new ProjectPersistenceError(error instanceof Error ? `The saved project could not be cleared: ${error.message}` : "The saved project could not be cleared.");
  }
}

export function loadProject(storage: ProjectStorage): ProjectLoadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(PROJECT_STORAGE_KEY);
  } catch (error) {
    return { status: "invalid", message: error instanceof Error ? `Local project storage is unavailable: ${error.message}` : "Local project storage is unavailable." };
  }
  if (!serialized) return { status: "empty" };
  try {
    return restoreProject(serialized);
  } catch (error) {
    return { status: "invalid", message: error instanceof Error ? error.message : "The saved project is corrupted or incompatible." };
  }
}

export function restoreProject(serialized: string): Extract<ProjectLoadResult, { status: "restored" }> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new ProjectPersistenceError("The saved project contains invalid JSON.");
  }
  const snapshot = record(value, "saved project");
  if (snapshot.version !== PROJECT_SNAPSHOT_VERSION) {
    throw new ProjectPersistenceError(`Saved project version ${String(snapshot.version)} is not supported by this version of VibeCraft.`);
  }
  if (!Number.isSafeInteger(snapshot.savedAt) || (snapshot.savedAt as number) < 0) throw new ProjectPersistenceError("The saved project timestamp is invalid.");
  const rawDocument = record(snapshot.document, "saved document");
  const structure = parseStructure(rawDocument.structure, "structure");
  const generationMetadata = parseGenerationMetadata(rawDocument.generationMetadata);
  const worldPlan = rawDocument.worldPlan === undefined ? undefined : validateWorldPlan(rawDocument.worldPlan);
  const worldPlanMetadata = parseWorldPlanMetadata(rawDocument.worldPlanMetadata);
  const semanticRegions = parseSemanticRegions(rawDocument.semanticRegions);
  const historyRaw = parseTransactionArray(rawDocument.history, "history");
  const futureRaw = parseTransactionArray(rawDocument.future, "future");

  let historyCursor = structure;
  const history = new Array<EditTransaction>(historyRaw.length);
  for (let index = historyRaw.length - 1; index >= 0; index -= 1) {
    const transaction = historyRaw[index];
    const after = cloneStructure(historyCursor);
    const before = applyPatchStrict(after, invertPatch(transaction.patch), `history[${index}]`);
    history[index] = { ...transaction, before: cloneStructure(before), after };
    historyCursor = before;
  }

  let futureCursor = structure;
  const future = futureRaw.map((transaction, index): EditTransaction => {
    const before = cloneStructure(futureCursor);
    const after = applyPatchStrict(before, transaction.patch, `future[${index}]`);
    futureCursor = after;
    return { ...transaction, before, after: cloneStructure(after) };
  });

  const pending = parsePendingEdit(rawDocument.pendingEdit);
  if (pending) applyPatchStrict(structure, pending.patch, "pendingEdit");
  const document: BuildingDocument = {
    structure: cloneStructure(structure),
    ...(generationMetadata ? { generationMetadata } : {}),
    ...(worldPlan ? { worldPlan } : {}),
    ...(worldPlanMetadata ? { worldPlanMetadata } : {}),
    semanticRegions,
    history,
    future,
    pendingEdit: null
  };
  return { status: "restored", document, savedAt: snapshot.savedAt as number, pendingEditDiscarded: Boolean(pending) };
}

function compactTransaction(transaction: EditTransaction): CompactTransaction {
  return {
    id: transaction.id,
    prompt: transaction.prompt,
    operations: transaction.operations,
    ...(transaction.toolCalls ? { toolCalls: transaction.toolCalls } : {}),
    patch: transaction.patch,
    createdAt: transaction.createdAt
  };
}

function parseTransactionArray(value: unknown, field: string): CompactTransaction[] {
  if (!Array.isArray(value) || value.length > 100) throw new ProjectPersistenceError(`${field} must be an array with at most 100 edits.`);
  return value.map((item, index) => parseTransaction(item, `${field}[${index}]`));
}

function parseTransaction(value: unknown, field: string): CompactTransaction {
  const raw = record(value, field);
  if (typeof raw.id !== "string" || !raw.id || typeof raw.prompt !== "string" || !Number.isSafeInteger(raw.createdAt) || (raw.createdAt as number) < 0) {
    throw new ProjectPersistenceError(`${field} metadata is invalid.`);
  }
  return {
    id: raw.id.slice(0, 100),
    prompt: raw.prompt.slice(0, 2_000),
    operations: parseOperations(raw.operations, `${field}.operations`),
    ...(raw.toolCalls === undefined ? {} : { toolCalls: parseToolCalls(raw.toolCalls, `${field}.toolCalls`) }),
    patch: parsePatch(raw.patch, `${field}.patch`),
    createdAt: raw.createdAt as number
  };
}

function parsePendingEdit(value: unknown): CompactPendingEdit | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, "pendingEdit");
  if (typeof raw.prompt !== "string") throw new ProjectPersistenceError("pendingEdit.prompt is invalid.");
  return {
    prompt: raw.prompt.slice(0, 2_000),
    operations: parseOperations(raw.operations, "pendingEdit.operations"),
    ...(raw.toolCalls === undefined ? {} : { toolCalls: parseToolCalls(raw.toolCalls, "pendingEdit.toolCalls") }),
    patch: parsePatch(raw.patch, "pendingEdit.patch")
  };
}

function parseOperations(value: unknown, field: string): BuildingOperation[] {
  if (!Array.isArray(value)) throw new ProjectPersistenceError(`${field} must be an array.`);
  if (!value.length) return [];
  try {
    return validateBuildingOperations(value);
  } catch (error) {
    throw new ProjectPersistenceError(`${field} is invalid: ${error instanceof Error ? error.message : "invalid operations"}`);
  }
}

function parseToolCalls(value: unknown, field: string): VoxelToolCall[] {
  try {
    const calls = validateVoxelToolCalls(value);
    if (calls.length > 16) throw new Error("more than 16 calls");
    return calls;
  } catch (error) {
    throw new ProjectPersistenceError(`${field} is invalid: ${error instanceof Error ? error.message : "invalid tool calls"}`);
  }
}

function parsePatch(value: unknown, field: string): StructurePatch {
  const raw = record(value, field);
  if (!Array.isArray(raw.changes) || !raw.changes.length || raw.changes.length > 20_000) {
    throw new ProjectPersistenceError(`${field}.changes must contain 1 to 20,000 changes.`);
  }
  return { changes: raw.changes.map((change, index) => parseChange(change, `${field}.changes[${index}]`)) };
}

function parseChange(value: unknown, field: string): BlockChange {
  const raw = record(value, field);
  if (raw.type === "add") return { type: raw.type, block: parseBlock(raw.block, `${field}.block`) };
  if (raw.type === "remove") return { type: raw.type, block: parseBlock(raw.block, `${field}.block`) };
  if (raw.type === "replace") {
    const before = parseBlock(raw.before, `${field}.before`);
    const after = parseBlock(raw.after, `${field}.after`);
    if (coordinateKey(before) !== coordinateKey(after)) throw new ProjectPersistenceError(`${field} must replace one coordinate in place.`);
    return { type: raw.type, before, after };
  }
  throw new ProjectPersistenceError(`${field}.type is invalid.`);
}

function parseStructure(value: unknown, field: string): VoxelStructure {
  const raw = record(value, field);
  if (typeof raw.name !== "string" || !raw.name || !Array.isArray(raw.size) || raw.size.length !== 3 || !raw.size.every(Number.isInteger) || !Array.isArray(raw.blocks) || raw.blocks.length > MAX_STRUCTURE_BLOCKS) {
    throw new ProjectPersistenceError(`${field} is invalid.`);
  }
  const seen = new Set<string>();
  const blocks = raw.blocks.map((item, index) => {
    const block = parseBlock(item, `${field}.blocks[${index}]`);
    const key = coordinateKey(block);
    if (seen.has(key)) throw new ProjectPersistenceError(`${field} contains duplicate coordinate ${key}.`);
    seen.add(key);
    return block;
  });
  const calculated = calculateStructureSize(blocks);
  const storedSize = raw.size as [number, number, number];
  if (calculated.some((size, index) => size !== storedSize[index])) throw new ProjectPersistenceError(`${field}.size does not match its blocks.`);
  return normalizeStructure({ name: raw.name.slice(0, 100), size: calculated, blocks });
}

function parseBlock(value: unknown, field: string): VoxelBlock {
  const raw = record(value, field);
  if (![raw.x, raw.y, raw.z].every(Number.isInteger)) throw new ProjectPersistenceError(`${field} coordinates must be integers.`);
  const x = raw.x as number, y = raw.y as number, z = raw.z as number;
  if (x < 0 || x >= SCENE_SIZE || y < 0 || y >= SCENE_SIZE || z < 0 || z >= SCENE_SIZE) throw new ProjectPersistenceError(`${field} is outside the ${SCENE_SIZE}×${SCENE_SIZE}×${SCENE_SIZE} scene.`);
  if (typeof raw.id !== "string" || !isBlockId(raw.id)) throw new ProjectPersistenceError(`${field}.id is invalid.`);
  if (raw.ownerId !== undefined && (typeof raw.ownerId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(raw.ownerId))) throw new ProjectPersistenceError(`${field}.ownerId is invalid.`);
  return { x, y, z, id: raw.id, ...(typeof raw.ownerId === "string" ? { ownerId: raw.ownerId } : {}) };
}

function parseGenerationMetadata(value: unknown): GenerationMetadata | undefined {
  if (value === undefined) return undefined;
  const raw = record(value, "generationMetadata");
  if (typeof raw.prompt !== "string" || !Number.isSafeInteger(raw.seed) || (raw.provider !== "deepseek-buildscript" && raw.provider !== "claude-buildscript" && raw.provider !== "local") || typeof raw.compilerVersion !== "string" || !Number.isSafeInteger(raw.operationCount) || !Number.isSafeInteger(raw.blockCount) || !Array.isArray(raw.validationWarnings) || raw.validationWarnings.some((warning) => typeof warning !== "string")) {
    throw new ProjectPersistenceError("generationMetadata is invalid.");
  }
  if (raw.buildScript !== undefined) {
    try { validateBuildScript(raw.buildScript); } catch (error) {
      throw new ProjectPersistenceError(`generationMetadata.buildScript is invalid: ${error instanceof Error ? error.message : "invalid BuildScript"}`);
    }
  }
  return structuredClone(value) as GenerationMetadata;
}

function parseWorldPlanMetadata(value: unknown): WorldPlanMetadata | undefined {
  if (value === undefined) return undefined;
  const raw = record(value, "worldPlanMetadata");
  if ((raw.provider !== "deepseek" && raw.provider !== "claude" && raw.provider !== "local") || typeof raw.prompt !== "string" || !Number.isSafeInteger(raw.seed) || raw.planVersion !== 1) throw new ProjectPersistenceError("worldPlanMetadata is invalid.");
  return { provider: raw.provider, prompt: raw.prompt, seed: raw.seed as number, planVersion: 1 };
}

function parseSemanticRegions(value: unknown): SemanticRegion[] {
  if (!Array.isArray(value) || value.length > 100) throw new ProjectPersistenceError("semanticRegions must be an array with at most 100 regions.");
  return value.map((item, index) => {
    const raw = record(item, `semanticRegions[${index}]`);
    if (typeof raw.id !== "string" || !raw.id || (raw.locked !== undefined && typeof raw.locked !== "boolean")) throw new ProjectPersistenceError(`semanticRegions[${index}] is invalid.`);
    return { id: raw.id.slice(0, 100), bounds: parseBox(raw.bounds, `semanticRegions[${index}].bounds`), ...(raw.locked === true ? { locked: true } : {}) };
  });
}

function parseBox(value: unknown, field: string): Box3D {
  const raw = record(value, field);
  const values = [raw.minX, raw.minY, raw.minZ, raw.maxX, raw.maxY, raw.maxZ];
  if (!values.every(Number.isInteger)) throw new ProjectPersistenceError(`${field} coordinates must be integers.`);
  const [minX, minY, minZ, maxX, maxY, maxZ] = values as number[];
  if (minX < 0 || minY < 0 || minZ < 0 || maxX > SCENE_MAX_COORDINATE || maxY > SCENE_MAX_COORDINATE || maxZ > SCENE_MAX_COORDINATE || minX > maxX || minY > maxY || minZ > maxZ) throw new ProjectPersistenceError(`${field} is outside the scene or inverted.`);
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function applyPatchStrict(structure: VoxelStructure, patch: StructurePatch, field: string): VoxelStructure {
  const map = new Map(structure.blocks.map((block) => [coordinateKey(block), { ...block }]));
  for (const [index, change] of patch.changes.entries()) {
    if (change.type === "add") {
      const key = coordinateKey(change.block);
      if (map.has(key)) throw new ProjectPersistenceError(`${field}.patch change ${index + 1} adds an occupied coordinate.`);
      map.set(key, { ...change.block });
    } else if (change.type === "remove") {
      const key = coordinateKey(change.block);
      if (!sameBlock(map.get(key), change.block)) throw new ProjectPersistenceError(`${field}.patch change ${index + 1} removes a mismatched coordinate.`);
      map.delete(key);
    } else {
      const key = coordinateKey(change.before);
      if (!sameBlock(map.get(key), change.before)) throw new ProjectPersistenceError(`${field}.patch change ${index + 1} replaces a mismatched coordinate.`);
      map.set(key, { ...change.after });
    }
  }
  return normalizeStructure({ ...structure, blocks: Array.from(map.values()) });
}

function sameBlock(left: VoxelBlock | undefined, right: VoxelBlock) {
  return Boolean(left && left.x === right.x && left.y === right.y && left.z === right.z && left.id === right.id && left.ownerId === right.ownerId);
}

function cloneStructure(structure: VoxelStructure): VoxelStructure {
  return { ...structure, size: [...structure.size], blocks: structure.blocks.map((block) => ({ ...block })) };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectPersistenceError(`${field} must be an object.`);
  return value as Record<string, unknown>;
}
