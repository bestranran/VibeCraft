import {
  BlockDefinition,
  BlockModel,
  BlockState,
  Cull,
  Identifier,
  Mesh,
  SpecialRenderers,
  TextureAtlas,
  type Quad,
} from "deepslate";
import * as THREE from "three";
import type { BlockId } from "./structure";

const VERSION = "1.20.1";
const RESOURCE_URL = `/minecraft/${VERSION}/resources.json`;

type JsonObject = Record<string, unknown>;

type PreparedResources = {
  minecraftVersion: string;
  blockstates: Record<string, JsonObject>;
  models: Record<string, JsonObject>;
  defaultProperties: Record<string, Record<string, string>>;
};

export type MinecraftModelPack = {
  atlasTexture: THREE.DataTexture;
  getGeometry: (id: BlockId, properties?: Record<string, string>) => THREE.BufferGeometry | null;
  getDefaultProperties: (id: BlockId) => Record<string, string>;
};

let resourceRequest: Promise<PreparedResources | null> | null = null;
const packRequests = new Map<string, Promise<MinecraftModelPack | null>>();

function normalizeIdentifier(value: string): string {
  return value.includes(":") ? value : `minecraft:${value}`;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadPreparedResources(): Promise<PreparedResources | null> {
  if (!resourceRequest) {
    resourceRequest = fetch(RESOURCE_URL)
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => {
        if (!isObject(value) || value.minecraftVersion !== VERSION) return null;
        if (!isObject(value.blockstates) || !isObject(value.models) || !isObject(value.defaultProperties)) return null;
        return value as PreparedResources;
      })
      .catch(() => null);
  }
  return resourceRequest;
}

function modelNamesFromBlockstate(blockstate: JsonObject): Set<string> {
  const names = new Set<string>();
  const addCandidate = (candidate: unknown) => {
    const candidates = Array.isArray(candidate) ? candidate : [candidate];
    for (const value of candidates) {
      if (isObject(value) && typeof value.model === "string") names.add(normalizeIdentifier(value.model));
    }
  };
  if (isObject(blockstate.variants)) {
    Object.values(blockstate.variants).forEach(addCandidate);
  }
  if (Array.isArray(blockstate.multipart)) {
    for (const part of blockstate.multipart) {
      if (isObject(part)) addCandidate(part.apply);
    }
  }
  return names;
}

function collectModelsAndTextures(data: PreparedResources, blockIds: readonly BlockId[]) {
  const modelNames = new Set<string>();
  const textureNames = new Set<string>();
  const visitModel = (name: string) => {
    name = normalizeIdentifier(name);
    if (modelNames.has(name)) return;
    modelNames.add(name);
    const raw = data.models[name];
    if (!raw) return;
    if (typeof raw.parent === "string" && !raw.parent.endsWith("builtin/entity")) visitModel(raw.parent);
    if (isObject(raw.textures)) {
      for (const texture of Object.values(raw.textures)) {
        if (typeof texture === "string" && !texture.startsWith("#")) {
          textureNames.add(normalizeIdentifier(texture));
        }
      }
    }
  };

  for (const id of blockIds) {
    const blockstate = data.blockstates[id];
    if (blockstate) modelNamesFromBlockstate(blockstate).forEach(visitModel);
    if (id === "minecraft:water" || id === "minecraft:lava") {
      const fluid = id.slice("minecraft:".length);
      textureNames.add(`minecraft:block/${fluid}_still`);
      textureNames.add(`minecraft:block/${fluid}_flow`);
    }
  }
  return { modelNames, textureNames };
}

async function createTextureAtlas(textureNames: Set<string>) {
  const entries = await Promise.all([...textureNames].sort().map(async (id) => {
    const [namespace, path] = id.split(":", 2);
    const response = await fetch(`/minecraft/${VERSION}/assets/${namespace}/textures/${path}.png`);
    if (!response.ok) return null;
    return { id, image: await createImageBitmap(await response.blob()) };
  }));
  const validEntries = entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const cells = Math.max(2, 2 ** Math.ceil(Math.log2(Math.ceil(Math.sqrt(validEntries.length + 1)))));
  const canvas = document.createElement("canvas");
  canvas.width = cells * 16;
  canvas.height = cells * 16;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable while preparing Minecraft textures.");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ff00ff";
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = "#000000";
  context.fillRect(0, 0, 8, 8);
  context.fillRect(8, 8, 8, 8);

  const idMap: Record<string, [number, number, number, number]> = {};
  validEntries.forEach(({ id, image }, entryIndex) => {
    const index = entryIndex + 1;
    const x = index % cells;
    const y = Math.floor(index / cells);
    const path = id.split(":", 2)[1];
    const cropAnimatedBlock = path.startsWith("block/") && image.height > image.width;
    const sourceHeight = cropAnimatedBlock ? image.width : image.height;
    context.drawImage(image, 0, 0, image.width, sourceHeight, x * 16, y * 16, 16, 16);
    idMap[id] = [x / cells, y / cells, (x + 1) / cells, (y + 1) / cells];
    image.close();
  });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const atlas = new TextureAtlas(imageData, idMap);
  const atlasTexture = new THREE.DataTexture(imageData.data, imageData.width, imageData.height, THREE.RGBAFormat);
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestMipmapNearestFilter;
  atlasTexture.generateMipmaps = true;
  atlasTexture.needsUpdate = true;
  return { atlas, atlasTexture };
}

function meshToGeometry(mesh: Mesh): THREE.BufferGeometry | null {
  if (mesh.quads.length === 0) return null;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  mesh.quads.forEach((quad: Quad, quadIndex: number) => {
    quad.vertices().forEach((vertex) => {
      positions.push(vertex.pos.x - 0.5, vertex.pos.y - 0.5, vertex.pos.z - 0.5);
      colors.push(...vertex.color);
      uvs.push(...(vertex.texture ?? [0, 0]));
    });
    const start = quadIndex * 4;
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

async function buildModelPack(blockIds: readonly BlockId[]): Promise<MinecraftModelPack | null> {
  const data = await loadPreparedResources();
  if (!data) return null;
  const { modelNames, textureNames } = collectModelsAndTextures(data, blockIds);
  const { atlas, atlasTexture } = await createTextureAtlas(textureNames);
  const modelCache = new Map<string, BlockModel | null>();
  const modelProvider = {
    getBlockModel(identifier: Identifier) {
      const name = identifier.toString();
      if (modelCache.has(name)) return modelCache.get(name) ?? null;
      const raw = data.models[name];
      if (!raw) {
        modelCache.set(name, null);
        return null;
      }
      const model = BlockModel.fromJson(raw);
      modelCache.set(name, model);
      model.flatten(modelProvider);
      return model;
    },
  };
  const definitionCache = new Map<string, BlockDefinition | null>();
  const geometryCache = new Map<string, THREE.BufferGeometry | null>();

  return {
    atlasTexture,
    getDefaultProperties(id) {
      return { ...(data.defaultProperties[id] ?? {}) };
    },
    getGeometry(id, properties = {}) {
      const mergedProperties = { ...(data.defaultProperties[id] ?? {}), ...properties };
      const cacheKey = `${id}[${Object.entries(mergedProperties).sort().map(([key, value]) => `${key}=${value}`).join(",")}]`;
      if (geometryCache.has(cacheKey)) return geometryCache.get(cacheKey) ?? null;
      let definition = definitionCache.get(id);
      if (definition === undefined) {
        const raw = data.blockstates[id];
        definition = raw ? BlockDefinition.fromJson(raw) : null;
        definitionCache.set(id, definition);
      }
      try {
        const blockName = Identifier.parse(id);
        const mesh = new Mesh();
        if (definition) mesh.merge(definition.getMesh(blockName, mergedProperties, atlas, modelProvider, Cull.none()));
        mesh.merge(SpecialRenderers.getBlockMesh(new BlockState(blockName, mergedProperties), undefined, atlas, Cull.none()));
        const geometry = meshToGeometry(mesh);
        geometryCache.set(cacheKey, geometry);
        return geometry;
      } catch (error) {
        console.warn(`Falling back to a color preview for ${id}.`, error);
        geometryCache.set(cacheKey, null);
        return null;
      }
    },
  };
}

export function loadMinecraftModelPack(blockIds: readonly BlockId[]): Promise<MinecraftModelPack | null> {
  const key = [...new Set(blockIds)].sort().join("|");
  let request = packRequests.get(key);
  if (!request) {
    request = buildModelPack([...new Set(blockIds)].sort() as BlockId[]).catch(() => null);
    packRequests.set(key, request);
  }
  return request;
}
