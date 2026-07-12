import { isBlockId } from "./structure";
import type { BlockId } from "./structure";

export type BuildingSpec = {
  name: string;
  style: "medieval" | "japanese" | "desert" | "rustic";
  width: number;
  depth: number;
  floors: number;
  wallHeight: number;
  roof: { type: "gable" | "hip" | "flat"; height: number; overhang: number };
  features: Array<"chimney" | "porch" | "path" | "lanterns">;
  palette: { foundation: BlockId; walls: BlockId; roof: BlockId; accent: BlockId };
};

const STYLES = ["medieval", "japanese", "desert", "rustic"] as const;
const ROOFS = ["gable", "hip", "flat"] as const;
const FEATURES = ["chimney", "porch", "path", "lanterns"] as const;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("DeepSeek returned an invalid building specification.");
  return value as Record<string, unknown>;
}

function choice<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`Invalid ${field} in building specification.`);
  return value as T;
}

function number(value: unknown, min: number, max: number, field: string) {
  if (!Number.isInteger(value)) throw new Error(`${field} must be an integer.`);
  return Math.max(min, Math.min(max, value as number));
}

function odd(value: unknown, min: number, max: number, field: string) {
  const safe = number(value, min, max, field);
  return safe % 2 === 0 ? Math.min(max, safe + 1) : safe;
}

function block(value: unknown, field: string): BlockId {
  if (typeof value !== "string" || !isBlockId(value)) throw new Error(`Invalid ${field} material.`);
  return value;
}

export function validateBuildingSpec(value: unknown): BuildingSpec {
  const raw = record(value);
  const roof = record(raw.roof);
  const palette = record(raw.palette);
  const features = Array.isArray(raw.features) ? raw.features.map((item) => choice(item, FEATURES, "feature")) : [];
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 60) : "vibecraft-build",
    style: choice(raw.style, STYLES, "style"),
    width: odd(raw.width, 7, 17, "width"),
    depth: odd(raw.depth, 7, 15, "depth"),
    floors: number(raw.floors, 1, 3, "floors"),
    wallHeight: number(raw.wallHeight, 4, 11, "wallHeight"),
    roof: { type: choice(roof.type, ROOFS, "roof type"), height: number(roof.height, 1, 7, "roof height"), overhang: number(roof.overhang, 0, 2, "roof overhang") },
    features: Array.from(new Set(features)),
    palette: {
      foundation: block(palette.foundation, "foundation"), walls: block(palette.walls, "walls"),
      roof: block(palette.roof, "roof"), accent: block(palette.accent, "accent")
    }
  };
}
