import { NextResponse } from "next/server";
import { applyBuildingOperations } from "@/lib/building-operations";
import { LocalBuildingPlanner } from "@/lib/building-planner";
import { createAiVoxelEditPlanner } from "@/lib/deepseek-voxel-edit-planner";
import { MAX_SCENE_BLOCKS, SCENE_MAX_COORDINATE, SCENE_SIZE, isBlockId } from "@/lib/structure";
import type { Box3D, GenerationMetadata, SemanticRegion, VoxelBlock, VoxelStructure } from "@/lib/structure";
import { createVoxelEditContext, assertVoxelEditScope } from "@/lib/voxel-edit-context";
import { executeVoxelTools } from "@/lib/voxel-tools";
import { resolveAiConnection } from "@/lib/ai-provider";

type EditRequest = {
  command?: unknown;
  structure?: unknown;
  generationMetadata?: unknown;
  semanticRegions?: unknown;
  writableBounds?: unknown;
};

const LEGACY_OPERATIONS = ["resizeRoof", "addWindows", "addChimney", "addPath", "changePalette", "addFloor", "removeFeature"];

export async function POST(request: Request) {
  try {
    const body = await request.json() as EditRequest;
    if (typeof body.command !== "string" || !body.command.trim()) {
      return NextResponse.json({ error: "Edit command is required." }, { status: 400 });
    }
    const structure = parseStructure(body.structure);
    const generationMetadata = parseGenerationMetadata(body.generationMetadata);
    const semanticRegions = parseSemanticRegions(body.semanticRegions);
    const writableBounds = body.writableBounds === undefined ? undefined : parseBox(body.writableBounds, "writableBounds");
    const command = body.command.trim();
    const context = createVoxelEditContext(structure, { generationMetadata, semanticRegions, writableBounds });
    const connection = resolveAiConnection(request);

    if (connection) {
      const plan = await createAiVoxelEditPlanner(connection.provider, connection.apiKey, {
        ...(connection.baseUrl ? { baseUrl: connection.baseUrl } : {}),
        ...(connection.apiMode ? { apiMode: connection.apiMode } : {}),
        ...(connection.model ? { model: connection.model } : {})
      }).planEdit(command, context);
      const execution = executeVoxelTools(structure, plan.toolCalls, {
        writableBounds,
        regions: semanticRegions
      });
      assertVoxelEditScope(execution.patch, plan.affectedOwnerIds);
      return NextResponse.json({
        toolCalls: plan.toolCalls,
        patch: execution.patch,
        preview: execution.structure,
        reports: execution.reports,
        summary: plan.summary,
        affectedOwnerIds: plan.affectedOwnerIds,
        repaired: plan.repaired,
        provider: `${connection.provider}-voxel-edit`,
        fallback: false
      });
    }

    const operations = await new LocalBuildingPlanner().planEdit({
      command,
      structureSummary: JSON.stringify(context),
      availableOperations: LEGACY_OPERATIONS
    }, structure);
    const result = applyBuildingOperations(structure, operations);
    assertLegacyPatchSafety(result.patch.changes.map((change) => change.type === "replace" ? change.after : change.block), writableBounds, semanticRegions);
    return NextResponse.json({
      operations,
      patch: result.patch,
      preview: result.structure,
      provider: "local-limited",
      fallback: true,
      limitedFallback: true,
      summary: "Limited local building edit"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The edit could not be planned.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function parseStructure(value: unknown): VoxelStructure {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A valid accepted structure is required.");
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== "string" || !Array.isArray(raw.blocks) || !raw.blocks.length || raw.blocks.length > MAX_SCENE_BLOCKS) {
    throw new Error("A valid non-empty accepted structure is required.");
  }
  const seen = new Set<string>();
  const blocks = raw.blocks.map((item, index): VoxelBlock => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Block ${index + 1} is invalid.`);
    const block = item as Record<string, unknown>;
    if (![block.x, block.y, block.z].every(Number.isInteger)) throw new Error(`Block ${index + 1} must use integer coordinates.`);
    const x = block.x as number, y = block.y as number, z = block.z as number;
    if (x < 0 || x >= SCENE_SIZE || y < 0 || y >= SCENE_SIZE || z < 0 || z >= SCENE_SIZE) throw new Error(`Block ${index + 1} is outside the ${SCENE_SIZE}×${SCENE_SIZE}×${SCENE_SIZE} scene.`);
    if (typeof block.id !== "string" || !isBlockId(block.id)) throw new Error(`Block ${index + 1} has an invalid material.`);
    if (block.ownerId !== undefined && (typeof block.ownerId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(block.ownerId))) {
      throw new Error(`Block ${index + 1} has an invalid ownerId.`);
    }
    const key = `${x},${y},${z}`;
    if (seen.has(key)) throw new Error(`The accepted structure contains duplicate coordinate ${key}.`);
    seen.add(key);
    return { x, y, z, id: block.id, ...(typeof block.ownerId === "string" ? { ownerId: block.ownerId } : {}) };
  });
  return { name: raw.name.slice(0, 100), size: Array.isArray(raw.size) && raw.size.length === 3 ? raw.size as [number, number, number] : [0, 0, 0], blocks };
}

function parseGenerationMetadata(value: unknown): GenerationMetadata | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("generationMetadata is invalid.");
  const raw = value as Record<string, unknown>;
  if (typeof raw.prompt !== "string" || !Number.isInteger(raw.seed) || (raw.provider !== "deepseek-buildscript" && raw.provider !== "claude-buildscript" && raw.provider !== "local") || typeof raw.compilerVersion !== "string") {
    throw new Error("generationMetadata is invalid.");
  }
  if (raw.buildScript !== undefined) {
    const script = raw.buildScript as { operations?: unknown };
    if (!script || typeof script !== "object" || !Array.isArray(script.operations)) throw new Error("generationMetadata BuildScript is invalid.");
  }
  return value as GenerationMetadata;
}

function parseSemanticRegions(value: unknown): SemanticRegion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error("semanticRegions is invalid.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`semanticRegions[${index}] is invalid.`);
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== "string" || (raw.locked !== undefined && typeof raw.locked !== "boolean")) throw new Error(`semanticRegions[${index}] is invalid.`);
    return { id: raw.id, bounds: parseBox(raw.bounds, `semanticRegions[${index}].bounds`), ...(raw.locked === true ? { locked: true } : {}) };
  });
}

function parseBox(value: unknown, field: string): Box3D {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} is invalid.`);
  const raw = value as Record<string, unknown>;
  const values = [raw.minX, raw.minY, raw.minZ, raw.maxX, raw.maxY, raw.maxZ];
  if (!values.every(Number.isInteger)) throw new Error(`${field} must use integer coordinates.`);
  const bounds = raw as unknown as Box3D;
  if (bounds.minX < 0 || bounds.minY < 0 || bounds.minZ < 0 || bounds.maxX > SCENE_MAX_COORDINATE || bounds.maxY > SCENE_MAX_COORDINATE || bounds.maxZ > SCENE_MAX_COORDINATE || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY || bounds.minZ > bounds.maxZ) {
    throw new Error(`${field} is outside the scene or inverted.`);
  }
  return { minX: bounds.minX, minY: bounds.minY, minZ: bounds.minZ, maxX: bounds.maxX, maxY: bounds.maxY, maxZ: bounds.maxZ };
}

function assertLegacyPatchSafety(changedBlocks: VoxelBlock[], writableBounds: Box3D | undefined, regions: SemanticRegion[]) {
  const locked = regions.filter((region) => region.locked);
  for (const block of changedBlocks) {
    if (writableBounds && !contains(writableBounds, block)) throw new Error("The limited local edit would change blocks outside the writable selection.");
    if (locked.some((region) => contains(region.bounds, block))) throw new Error("The limited local edit would change a locked region.");
  }
}

function contains(bounds: Box3D, block: Pick<VoxelBlock, "x" | "y" | "z">) {
  return block.x >= bounds.minX && block.x <= bounds.maxX && block.y >= bounds.minY && block.y <= bounds.maxY && block.z >= bounds.minZ && block.z <= bounds.maxZ;
}
