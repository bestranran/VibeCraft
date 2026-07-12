import { BLOCK_IDS, isBlockId } from "./structure";
import type { BuildingOperation } from "./structure";

const SIDES = ["front", "back", "left", "right", "all"] as const;
const REGIONS = ["all", "walls", "roof", "foundation"] as const;
const FEATURES = ["chimney", "path", "windows"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, min: number, max: number, field: string) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field} must be an integer from ${min} to ${max}.`);
  }
  return value as number;
}

function member<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`Invalid ${field}.`);
  return value as T;
}

export function validateBuildingOperations(value: unknown): BuildingOperation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 6) {
    throw new Error("The planner must return between 1 and 6 operations.");
  }

  return value.map((raw, index): BuildingOperation => {
    if (!isRecord(raw) || typeof raw.type !== "string") throw new Error(`Operation ${index + 1} is invalid.`);
    switch (raw.type) {
      case "resizeRoof": return { type: raw.type, heightDelta: integer(raw.heightDelta, -3, 5, "heightDelta") };
      case "addWindows": return { type: raw.type, side: member(raw.side, SIDES, "side"), count: integer(raw.count, 1, 12, "count") };
      case "addChimney": return { type: raw.type, side: member(raw.side, ["left", "right"] as const, "side") };
      case "addPath": {
        if (typeof raw.material !== "string" || !isBlockId(raw.material)) throw new Error(`material must be one of: ${BLOCK_IDS.join(", ")}.`);
        return { type: raw.type, length: integer(raw.length, 1, 24, "length"), width: integer(raw.width, 1, 5, "width"), material: raw.material };
      }
      case "changePalette": {
        if (typeof raw.to !== "string" || !isBlockId(raw.to)) throw new Error("Invalid target block material.");
        if (raw.from !== undefined && (typeof raw.from !== "string" || !isBlockId(raw.from))) throw new Error("Invalid source block material.");
        return { type: raw.type, ...(raw.from ? { from: raw.from } : {}), to: raw.to, ...(raw.region ? { region: member(raw.region, REGIONS, "region") } : {}) };
      }
      case "addFloor": return { type: raw.type, count: integer(raw.count, 1, 2, "count") };
      case "removeFeature": return { type: raw.type, feature: member(raw.feature, FEATURES, "feature") };
      default: throw new Error(`Unsupported operation: ${raw.type}`);
    }
  });
}
