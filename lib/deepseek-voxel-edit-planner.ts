import { validateVoxelToolCalls } from "./voxel-tools";
import type { VoxelToolCall } from "./structure";
import type { VoxelEditContext } from "./voxel-edit-context";
import { aiProviderLabel, requestAiText } from "./ai-provider";
import type { AiApiMode, AiProvider } from "./ai-provider";

const SYSTEM_PROMPT = `You are the conversational voxel-edit planner for VibeCraft Studio.
Turn the user's exact Chinese or English instruction into the smallest safe set of voxel tool calls. The current structure may be a robot, fountain, building, sculpture, or any other subject. Never impose building semantics and never regenerate the whole scene.

Return JSON only in this exact top-level shape:
{"summary":"short description","affectedOwnerIds":["existing-owner-id"],"toolCalls":[...]}

affectedOwnerIds is a safety declaration. List every EXISTING component whose blocks may be removed, replaced, or overwritten. Reading a component as a copy/mirror source does not modify it. New geometry should receive a specific ownerId, normally the target component's ownerId. Use "__unowned__" for existing blocks without an owner. Do not list unrelated components.

Allowed calls:
- {"type":"fill","from":[x,y,z],"to":[x,y,z],"material":"minecraft:stone","ownerId":"id","mode":"overwrite|empty"}
- {"type":"remove","from":[x,y,z],"to":[x,y,z]}
- {"type":"replace","from":[x,y,z],"to":[x,y,z],"fromMaterial":"minecraft:stone","toMaterial":"minecraft:red_concrete","ownerId":"id"}
- {"type":"line","from":[x,y,z],"to":[x,y,z],"material":"minecraft:oak_planks","ownerId":"id","mode":"overwrite|empty"}
- {"type":"copy","source":{"minX":n,"minY":n,"minZ":n,"maxX":n,"maxY":n,"maxZ":n},"offset":[dx,dy,dz],"ownerId":"id","mode":"overwrite|empty"}
- {"type":"mirror","source":{"minX":n,"minY":n,"minZ":n,"maxX":n,"maxY":n,"maxZ":n},"axis":"x|z","pivot":n,"ownerId":"id","mode":"overwrite|empty"}

Material values in the schemas are examples. Choose any real Minecraft Java 1.20.1 block ID that matches the user's request; never output the literal placeholder minecraft:block_id. All numbers are integers. All destination coordinates must stay within x/z 0..127 and y 0..127 and within writableBounds when supplied. Locked regions are read-only. Use at most 16 calls and avoid visiting broad empty volumes. Prefer replace for material changes, remove for deletion, copy/mirror for duplication, and compact fill/line calls for geometry. Preserve unrelated owner groups and unchanged materials. Return at least one call that makes a real change.`;

export type VoxelEditPlan = {
  summary: string;
  affectedOwnerIds: string[];
  toolCalls: VoxelToolCall[];
  repaired: boolean;
};

export class VoxelEditPlanningError extends Error {}

export class DeepSeekVoxelEditPlanner {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.DEEPSEEK_MODEL || "deepseek-chat",
    private readonly baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    private readonly provider: AiProvider = "deepseek",
    private readonly apiMode?: AiApiMode
  ) {}

  async planEdit(command: string, context: VoxelEditContext): Promise<VoxelEditPlan> {
    const input = JSON.stringify({ instruction: command, context });
    const firstContent = await this.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: input }
    ], 0.1);
    try {
      return { ...parseVoxelEditPlan(firstContent, context), repaired: false };
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : "Invalid edit-plan format.";
      const repairedContent = await this.chat([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input },
        { role: "assistant", content: firstContent.slice(0, 12_000) },
        {
          role: "user",
          content: `Your previous response was invalid: ${diagnostic.slice(0, 500)}. Return one complete corrected JSON object only. Do not change the user's requested edit.`
        }
      ], 0);
      try {
        return { ...parseVoxelEditPlan(repairedContent, context), repaired: true };
      } catch (repairError) {
        throw new VoxelEditPlanningError(`${aiProviderLabel(this.provider)} returned an invalid voxel edit after one repair attempt: ${repairError instanceof Error ? repairError.message : "invalid format"}`);
      }
    }
  }

  private async chat(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, temperature: number) {
    try {
      return await requestAiText({
        provider: this.provider,
        apiKey: this.apiKey,
        model: this.model,
        baseUrl: this.baseUrl,
        ...(this.apiMode ? { apiMode: this.apiMode } : {}),
        temperature,
        maxTokens: 4096,
        timeoutMs: 120_000,
        messages
      });
    } catch (error) {
      throw new VoxelEditPlanningError(error instanceof Error ? error.message : `${aiProviderLabel(this.provider)} edit request failed.`);
    }
  }
}

export function createAiVoxelEditPlanner(provider: AiProvider, apiKey: string, options: { baseUrl?: string; apiMode?: AiApiMode; model?: string } = {}) {
  if (provider === "claude") {
    return new DeepSeekVoxelEditPlanner(
      apiKey,
      options.model || process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      options.baseUrl || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
      "claude",
      options.apiMode
    );
  }
  return new DeepSeekVoxelEditPlanner(apiKey);
}

export function parseVoxelEditPlan(content: string, context: VoxelEditContext): Omit<VoxelEditPlan, "repaired"> {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch {
    throw new VoxelEditPlanningError("The response is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VoxelEditPlanningError("The edit plan must be a JSON object.");
  const raw = value as Record<string, unknown>;
  if (typeof raw.summary !== "string" || !raw.summary.trim()) throw new VoxelEditPlanningError("The edit plan is missing a summary.");
  if (!Array.isArray(raw.affectedOwnerIds) || raw.affectedOwnerIds.some((item) => typeof item !== "string")) {
    throw new VoxelEditPlanningError("affectedOwnerIds must be an array of component IDs.");
  }
  const knownOwners = new Set(context.components.map((component) => component.ownerId));
  const affectedOwnerIds = Array.from(new Set(raw.affectedOwnerIds as string[]));
  const unknownOwners = affectedOwnerIds.filter((ownerId) => !knownOwners.has(ownerId));
  if (unknownOwners.length) throw new VoxelEditPlanningError(`affectedOwnerIds contains unknown component IDs: ${unknownOwners.join(", ")}.`);
  const toolCalls = validateVoxelToolCalls(raw.toolCalls);
  if (toolCalls.length > 16) throw new VoxelEditPlanningError("The edit plan exceeds the 16-call budget.");
  return { summary: raw.summary.trim().slice(0, 300), affectedOwnerIds, toolCalls };
}
