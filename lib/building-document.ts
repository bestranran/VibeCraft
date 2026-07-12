import type { BuildingDocument, EditTransaction, PendingEdit, VoxelStructure } from "./structure";

export function cloneStructure(structure: VoxelStructure): VoxelStructure {
  return { ...structure, size: [...structure.size], blocks: structure.blocks.map((block) => ({ ...block })) };
}

export function createBuildingDocument(structure: VoxelStructure): BuildingDocument {
  return { structure: cloneStructure(structure), history: [], future: [], pendingEdit: null };
}

export function setPendingEdit(document: BuildingDocument, pendingEdit: PendingEdit): BuildingDocument {
  return { ...document, pendingEdit };
}

export function rejectPendingEdit(document: BuildingDocument): BuildingDocument {
  return { ...document, pendingEdit: null };
}

export function acceptPendingEdit(document: BuildingDocument, metadata?: { id?: string; createdAt?: number }): BuildingDocument {
  if (!document.pendingEdit) return document;
  const pending = document.pendingEdit;
  const transaction: EditTransaction = {
    id: metadata?.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`),
    prompt: pending.prompt,
    operations: pending.operations,
    patch: pending.patch,
    before: cloneStructure(document.structure),
    after: cloneStructure(pending.preview),
    createdAt: metadata?.createdAt ?? Date.now()
  };
  return { structure: cloneStructure(pending.preview), history: [...document.history, transaction], future: [], pendingEdit: null };
}

export function undoDocument(document: BuildingDocument): BuildingDocument {
  if (document.pendingEdit || !document.history.length) return document;
  const transaction = document.history[document.history.length - 1];
  return { structure: cloneStructure(transaction.before), history: document.history.slice(0, -1), future: [transaction, ...document.future], pendingEdit: null };
}

export function redoDocument(document: BuildingDocument): BuildingDocument {
  if (document.pendingEdit || !document.future.length) return document;
  const [transaction, ...future] = document.future;
  return { structure: cloneStructure(transaction.after), history: [...document.history, transaction], future, pendingEdit: null };
}
