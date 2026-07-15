import type { BuildingDocument, EditTransaction, GenerationMetadata, PendingEdit, SemanticRegion, VoxelStructure, WorldPlan, WorldPlanMetadata } from "./structure";

export function cloneStructure(structure: VoxelStructure): VoxelStructure {
  return { ...structure, size: [...structure.size], blocks: structure.blocks.map((block) => ({ ...block })) };
}

export function cloneGenerationMetadata(metadata: GenerationMetadata): GenerationMetadata {
  return structuredClone(metadata);
}

export function createBuildingDocument(structure: VoxelStructure, metadata?: { generationMetadata?: GenerationMetadata; worldPlan?: WorldPlan; worldPlanMetadata?: WorldPlanMetadata; semanticRegions?: SemanticRegion[] }): BuildingDocument {
  const semanticRegions = metadata?.semanticRegions ?? metadata?.worldPlan?.regions ?? [];
  return {
    structure: cloneStructure(structure),
    ...(metadata?.generationMetadata ? { generationMetadata: cloneGenerationMetadata(metadata.generationMetadata) } : {}),
    ...(metadata?.worldPlan ? { worldPlan: metadata.worldPlan } : {}),
    ...(metadata?.worldPlanMetadata ? { worldPlanMetadata: { ...metadata.worldPlanMetadata } } : {}),
    semanticRegions: semanticRegions.map((region) => ({ ...region, bounds: { ...region.bounds } })),
    history: [],
    future: [],
    pendingEdit: null
  };
}

export function setWorldPlan(document: BuildingDocument, worldPlan: WorldPlan, metadata: WorldPlanMetadata): BuildingDocument {
  return {
    ...document,
    worldPlan,
    worldPlanMetadata: { ...metadata },
    semanticRegions: worldPlan.regions.map((region) => ({ ...region, bounds: { ...region.bounds } }))
  };
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
    ...(pending.toolCalls ? { toolCalls: pending.toolCalls } : {}),
    patch: pending.patch,
    before: cloneStructure(document.structure),
    after: cloneStructure(pending.preview),
    createdAt: metadata?.createdAt ?? Date.now()
  };
  return { ...document, structure: cloneStructure(pending.preview), history: [...document.history, transaction], future: [], pendingEdit: null };
}

export function undoDocument(document: BuildingDocument): BuildingDocument {
  if (document.pendingEdit || !document.history.length) return document;
  const transaction = document.history[document.history.length - 1];
  return { ...document, structure: cloneStructure(transaction.before), history: document.history.slice(0, -1), future: [transaction, ...document.future], pendingEdit: null };
}

export function redoDocument(document: BuildingDocument): BuildingDocument {
  if (document.pendingEdit || !document.future.length) return document;
  const [transaction, ...future] = document.future;
  return { ...document, structure: cloneStructure(transaction.after), history: [...document.history, transaction], future, pendingEdit: null };
}
