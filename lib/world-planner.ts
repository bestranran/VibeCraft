import { SCENE_MAX_COORDINATE, SCENE_SIZE, isBlockId } from "./structure";
import type {
  BlockId,
  Box2D,
  ConnectionSpec,
  LandmarkSpec,
  LotSpec,
  PlannedBuildingSpec,
  RoadSpec,
  SemanticRegion,
  WorldPlan
} from "./structure";

export type WorldPlanPreferences = {
  name: string;
  themeName: string;
  palette: BlockId[];
  roadOrientation: "north-south" | "east-west";
  roadWidth: number;
  lots: Array<{
    purpose: LotSpec["purpose"];
    height: number;
    roof: PlannedBuildingSpec["roof"];
    wallMaterial: BlockId;
    roofMaterial: BlockId;
  }>;
  landmarkLot: number;
  bridgeRows: number[];
};

const PURPOSES = ["residential", "commercial", "industrial", "utility"] as const;
const ROOFS = ["flat", "gable"] as const;
const DEFAULT_PALETTE: BlockId[] = [
  "minecraft:dark_oak_planks",
  "minecraft:stone_bricks",
  "minecraft:bricks",
  "minecraft:lantern"
];

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, min: number, max: number, field: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${field} must be an integer from ${min} to ${max}.`);
  return value as number;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`Invalid ${field}.`);
  return value as T;
}

function block(value: unknown, field: string): BlockId {
  if (typeof value !== "string" || !isBlockId(value)) throw new Error(`Invalid ${field} material.`);
  return value;
}

function slug(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return safe.slice(0, 48) || fallback;
}

export function validateWorldPlanPreferences(value: unknown): WorldPlanPreferences {
  const raw = record(value, "preferences");
  if (!Array.isArray(raw.palette) || raw.palette.length < 2 || raw.palette.length > 8) throw new Error("palette must contain 2 to 8 materials.");
  if (!Array.isArray(raw.lots) || raw.lots.length !== 6) throw new Error("preferences must describe exactly six lots.");
  const palette = Array.from(new Set(raw.palette.map((item, index) => block(item, `palette[${index}]`))));
  const lots = raw.lots.map((item, index) => {
    const lot = record(item, `lots[${index}]`);
    return {
      purpose: choice(lot.purpose, PURPOSES, "lot purpose"),
      height: integer(lot.height, 6, 84, "building height"),
      roof: choice(lot.roof, ROOFS, "roof"),
      wallMaterial: block(lot.wallMaterial, "wall"),
      roofMaterial: block(lot.roofMaterial, "roof")
    };
  });
  const bridgeRows = Array.isArray(raw.bridgeRows)
    ? Array.from(new Set(raw.bridgeRows.map((item) => integer(item, 0, 2, "bridge row")))).slice(0, 2)
    : [0, 2];
  while (bridgeRows.length < 2) bridgeRows.push(bridgeRows[0] === 0 ? 2 : 0);
  return {
    name: slug(raw.name, "vibecraft-district"),
    themeName: typeof raw.themeName === "string" && raw.themeName.trim() ? raw.themeName.trim().slice(0, 60) : "cyberpunk",
    palette,
    roadOrientation: choice(raw.roadOrientation, ["north-south", "east-west"] as const, "road orientation"),
    roadWidth: integer(raw.roadWidth, 8, 16, "road width"),
    lots,
    landmarkLot: integer(raw.landmarkLot, 2, 3, "landmark lot"),
    bridgeRows
  };
}

export function promptSeed(prompt: string): number {
  let hash = 2166136261;
  for (let index = 0; index < prompt.length; index += 1) {
    hash ^= prompt.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function localPreferences(prompt: string, seed: number): WorldPlanPreferences {
  const lower = prompt.toLowerCase();
  const orientation = seed % 2 === 0 ? "north-south" : "east-west";
  const purposes: LotSpec["purpose"][] = ["residential", "residential", "commercial", "industrial", "utility", "commercial"];
  const heights = [24, 32, 44, 28, 20, 36].map((height, index) => height + ((seed >>> (index * 3)) % 9));
  const landmarkLot = 2;
  heights[landmarkLot] = lower.includes("tower") || lower.includes("塔") ? 72 : 60;
  return {
    name: lower.includes("cyber") || lower.includes("赛博") ? "cyberpunk-district" : "vibecraft-district",
    themeName: lower.includes("industrial") || lower.includes("工业") ? "industrial cyberpunk" : "dense cyberpunk",
    palette: [...DEFAULT_PALETTE],
    roadOrientation: orientation,
    roadWidth: 12,
    lots: purposes.map((purpose, index) => ({ purpose, height: heights[index], roof: index === landmarkLot ? "flat" : index % 3 === 0 ? "gable" : "flat", wallMaterial: index % 2 ? "minecraft:bricks" : "minecraft:dark_oak_planks", roofMaterial: "minecraft:stone_bricks" })),
    landmarkLot,
    bridgeRows: [0, 2]
  };
}

function oddAtMost(value: number, max: number): number {
  const bounded = Math.min(value, max);
  return bounded % 2 === 0 ? bounded - 1 : bounded;
}

function transposeBox(box: Box2D): Box2D {
  return { minX: box.minZ, minZ: box.minX, maxX: box.maxZ, maxZ: box.maxX };
}

export function createDeterministicWorldPlan(prompt: string, seed = promptSeed(prompt), supplied?: WorldPlanPreferences): WorldPlan {
  const preferences = supplied ?? localPreferences(prompt, seed);
  const tallestNonLandmark = Math.max(...preferences.lots.filter((_, index) => index !== preferences.landmarkLot).map((lot) => lot.height));
  const roadMin = 64 - Math.floor(preferences.roadWidth / 2);
  const roadMax = roadMin + preferences.roadWidth - 1;
  const baseRoad: RoadSpec = { id: "road-main", bounds: { minX: roadMin, minZ: 0, maxX: roadMax, maxZ: SCENE_MAX_COORDINATE }, width: preferences.roadWidth, material: "minecraft:stone_bricks" };
  const rows: Array<[number, number]> = [[8, 43], [46, 81], [84, 119]];
  const baseLots: Box2D[] = rows.flatMap(([minZ, maxZ]) => [
    { minX: 8, minZ, maxX: roadMin - 5, maxZ },
    { minX: roadMax + 5, minZ, maxX: 119, maxZ }
  ]);
  const orientedRoad = preferences.roadOrientation === "north-south" ? baseRoad : { ...baseRoad, bounds: transposeBox(baseRoad.bounds) };
  const orientedLots = preferences.roadOrientation === "north-south" ? baseLots : baseLots.map(transposeBox);
  const lots: LotSpec[] = orientedLots.map((bounds, index) => {
    const width = bounds.maxX - bounds.minX + 1;
    const depth = bounds.maxZ - bounds.minZ + 1;
    const preference = preferences.lots[index];
    return {
      id: `lot-${index + 1}`,
      bounds,
      purpose: preference.purpose,
      building: {
        width: oddAtMost(width - 8, 39),
        depth: oddAtMost(depth - 8, 31),
        height: index === preferences.landmarkLot ? Math.max(preference.height, Math.min(104, tallestNonLandmark + 12)) : preference.height,
        roof: preference.roof,
        wallMaterial: preference.wallMaterial,
        roofMaterial: preference.roofMaterial
      }
    };
  });
  const landmarkLot = lots[preferences.landmarkLot];
  const landmarks: LandmarkSpec[] = [{ id: "landmark-central-tower", bounds: { ...landmarkLot.bounds }, kind: "central-tower" }];
  const connections: ConnectionSpec[] = preferences.bridgeRows.map((row, index) => ({ id: `bridge-${index + 1}`, fromRegionId: lots[row * 2].id, toRegionId: lots[row * 2 + 1].id, kind: "bridge" }));
  const regions: SemanticRegion[] = [
    { id: orientedRoad.id, bounds: { ...orientedRoad.bounds, minY: 0, maxY: 3 } },
    ...lots.map((lot) => ({ id: lot.id, bounds: { ...lot.bounds, minY: 0, maxY: Math.min(SCENE_MAX_COORDINATE, lot.building.height + 12) }, ...(lot.id === landmarkLot.id ? { locked: false } : {}) }))
  ];
  return validateWorldPlan({
    id: `world-${seed.toString(16)}`,
    name: preferences.name,
    theme: { name: preferences.themeName, palette: preferences.palette },
    bounds: { width: SCENE_SIZE, depth: SCENE_SIZE, maxHeight: SCENE_SIZE },
    roads: [orientedRoad], lots, landmarks, connections, regions
  });
}

function validateBox(value: unknown, field: string): Box2D {
  const raw = record(value, field);
  const result = { minX: integer(raw.minX, 0, SCENE_MAX_COORDINATE, `${field}.minX`), minZ: integer(raw.minZ, 0, SCENE_MAX_COORDINATE, `${field}.minZ`), maxX: integer(raw.maxX, 0, SCENE_MAX_COORDINATE, `${field}.maxX`), maxZ: integer(raw.maxZ, 0, SCENE_MAX_COORDINATE, `${field}.maxZ`) };
  if (result.minX > result.maxX || result.minZ > result.maxZ) throw new Error(`${field} has reversed bounds.`);
  return result;
}

function overlaps(a: Box2D, b: Box2D): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

export function validateWorldPlan(value: unknown): WorldPlan {
  const raw = record(value, "world plan");
  const bounds = record(raw.bounds, "bounds");
  if (bounds.width !== SCENE_SIZE || bounds.depth !== SCENE_SIZE) throw new Error(`World plan bounds must be ${SCENE_SIZE}×${SCENE_SIZE}.`);
  const maxHeight = integer(bounds.maxHeight, 1, SCENE_SIZE, "maxHeight");
  const theme = record(raw.theme, "theme");
  if (!Array.isArray(theme.palette) || theme.palette.length < 2) throw new Error("Theme palette requires at least two materials.");
  const palette = Array.from(new Set(theme.palette.map((item, index) => block(item, `theme.palette[${index}]`))));
  if (!Array.isArray(raw.roads) || !raw.roads.length) throw new Error("World plan requires a road.");
  const roads: RoadSpec[] = raw.roads.map((item, index) => {
    const road = record(item, `roads[${index}]`);
    const roadBounds = validateBox(road.bounds, `roads[${index}].bounds`);
    const width = integer(road.width, 1, 24, "road width");
    const spansScene = (roadBounds.minX === 0 && roadBounds.maxX === SCENE_MAX_COORDINATE) || (roadBounds.minZ === 0 && roadBounds.maxZ === SCENE_MAX_COORDINATE);
    if (!spansScene) throw new Error(`Road ${index + 1} must connect opposite scene boundaries.`);
    const crossSection = roadBounds.minX === 0 && roadBounds.maxX === SCENE_MAX_COORDINATE ? roadBounds.maxZ - roadBounds.minZ + 1 : roadBounds.maxX - roadBounds.minX + 1;
    if (crossSection !== width) throw new Error(`Road ${index + 1} width does not match its bounds.`);
    return { id: slug(road.id, `road-${index + 1}`), bounds: roadBounds, width, material: block(road.material, "road") };
  });
  if (!Array.isArray(raw.lots) || !raw.lots.length || raw.lots.length > 12) throw new Error("World plan requires 1 to 12 lots.");
  const lots: LotSpec[] = raw.lots.map((item, index) => {
    const lot = record(item, `lots[${index}]`);
    const lotBounds = validateBox(lot.bounds, `lots[${index}].bounds`);
    const building = record(lot.building, `lots[${index}].building`);
    const lotWidth = lotBounds.maxX - lotBounds.minX + 1;
    const lotDepth = lotBounds.maxZ - lotBounds.minZ + 1;
    const buildingWidth = integer(building.width, 3, lotWidth, "building width");
    const buildingDepth = integer(building.depth, 3, lotDepth, "building depth");
    return { id: slug(lot.id, `lot-${index + 1}`), bounds: lotBounds, purpose: choice(lot.purpose, PURPOSES, "lot purpose"), building: { width: buildingWidth, depth: buildingDepth, height: integer(building.height, 4, maxHeight - 4, "building height"), roof: choice(building.roof, ROOFS, "roof"), wallMaterial: block(building.wallMaterial, "wall"), roofMaterial: block(building.roofMaterial, "roof") }, ...(lot.locked === true ? { locked: true } : {}) };
  });
  for (let index = 0; index < lots.length; index += 1) {
    if (roads.some((road) => overlaps(lots[index].bounds, road.bounds))) throw new Error(`Lot ${lots[index].id} overlaps a road.`);
    if (lots.slice(index + 1).some((other) => overlaps(lots[index].bounds, other.bounds))) throw new Error(`Lot ${lots[index].id} overlaps another lot.`);
  }
  const ids = new Set([...roads.map((road) => road.id), ...lots.map((lot) => lot.id)]);
  if (ids.size !== roads.length + lots.length) throw new Error("Road and lot ids must be unique.");
  if (!Array.isArray(raw.landmarks) || !raw.landmarks.length) throw new Error("World plan requires a landmark.");
  const landmarks: LandmarkSpec[] = raw.landmarks.map((item, index) => { const landmark = record(item, `landmarks[${index}]`); return { id: slug(landmark.id, `landmark-${index + 1}`), bounds: validateBox(landmark.bounds, "landmark bounds"), kind: typeof landmark.kind === "string" && landmark.kind.trim() ? landmark.kind.trim().slice(0, 48) : "landmark" }; });
  if (!Array.isArray(raw.connections)) throw new Error("connections must be an array.");
  const connections: ConnectionSpec[] = raw.connections.map((item, index) => { const connection = record(item, `connections[${index}]`); const fromRegionId = slug(connection.fromRegionId, ""); const toRegionId = slug(connection.toRegionId, ""); if (!ids.has(fromRegionId) || !ids.has(toRegionId) || fromRegionId === toRegionId) throw new Error(`Connection ${index + 1} has invalid endpoints.`); return { id: slug(connection.id, `connection-${index + 1}`), fromRegionId, toRegionId, kind: choice(connection.kind, ["road", "bridge", "pipe"] as const, "connection kind") }; });
  if (!Array.isArray(raw.regions)) throw new Error("regions must be an array.");
  const regions: SemanticRegion[] = raw.regions.map((item, index) => { const region = record(item, `regions[${index}]`); const horizontal = validateBox(region.bounds, "region bounds"); const regionBounds = record(region.bounds, "region bounds"); return { id: slug(region.id, `region-${index + 1}`), bounds: { ...horizontal, minY: integer(regionBounds.minY, 0, maxHeight - 1, "region minY"), maxY: integer(regionBounds.maxY, 0, maxHeight - 1, "region maxY") }, ...(region.locked === true ? { locked: true } : {}) }; });
  if (regions.some((region) => region.bounds.minY > region.bounds.maxY)) throw new Error("A semantic region has reversed height bounds.");
  return { id: slug(raw.id, "world-plan"), name: slug(raw.name, "vibecraft-district"), theme: { name: typeof theme.name === "string" && theme.name.trim() ? theme.name.trim().slice(0, 60) : "district", palette }, bounds: { width: SCENE_SIZE, depth: SCENE_SIZE, maxHeight }, roads, lots, landmarks, connections, regions };
}

export function createLocalWorldPlan(prompt: string, seed = promptSeed(prompt)): WorldPlan {
  return createDeterministicWorldPlan(prompt, seed);
}
