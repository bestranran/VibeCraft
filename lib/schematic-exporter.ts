import { gzipSync } from "node:zlib";
import { toSchematicFilename } from "./exporters";
import { isBlockId } from "./structure";
import type { VoxelBlock, VoxelStructure } from "./structure";

export const SCHEMATIC_FORMAT_VERSION = 2;
export const MINECRAFT_DATA_VERSION_1_20_1 = 3465;

export type SchematicExportOptions = {
  minecraftVersion?: "1.20.1";
};

export type NormalizedSchematic = {
  width: number;
  height: number;
  length: number;
  offset: [number, number, number];
  palette: Map<string, number>;
  blockData: Uint8Array;
};

export class SchematicExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchematicExportError";
  }
}

enum Tag {
  End = 0,
  Byte = 1,
  Short = 2,
  Int = 3,
  ByteArray = 7,
  List = 9,
  Compound = 10,
  IntArray = 11
}

function bytes(...values: number[]) {
  return Buffer.from(values);
}

function short(value: number) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeInt16BE(value);
  return buffer;
}

function unsignedShort(value: number) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function int(value: number) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function name(value: string) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > 65_535) throw new SchematicExportError("NBT tag name is too long.");
  return Buffer.concat([unsignedShort(encoded.length), encoded]);
}

function named(type: Tag, tagName: string, payload: Buffer) {
  return Buffer.concat([bytes(type), name(tagName), payload]);
}

function intTag(tagName: string, value: number) {
  return named(Tag.Int, tagName, int(value));
}

function shortTag(tagName: string, value: number) {
  return named(Tag.Short, tagName, short(value));
}

function intArrayTag(tagName: string, values: number[]) {
  return named(Tag.IntArray, tagName, Buffer.concat([int(values.length), ...values.map(int)]));
}

function byteArrayTag(tagName: string, value: Uint8Array) {
  return named(Tag.ByteArray, tagName, Buffer.concat([int(value.length), Buffer.from(value)]));
}

function compoundTag(tagName: string, children: Buffer[]) {
  return named(Tag.Compound, tagName, Buffer.concat([...children, bytes(Tag.End)]));
}

function emptyCompoundListTag(tagName: string) {
  return named(Tag.List, tagName, Buffer.concat([bytes(Tag.Compound), int(0)]));
}

function coordinateKey(block: Pick<VoxelBlock, "x" | "y" | "z">) {
  return `${block.x},${block.y},${block.z}`;
}

function encodeVarInt(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) throw new SchematicExportError("Palette indexes must be non-negative integers.");
  const output: number[] = [];
  let remaining = value >>> 0;
  do {
    let current = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining) current |= 0x80;
    output.push(current);
  } while (remaining);
  return output;
}

export function normalizeSchematicStructure(structure: VoxelStructure): NormalizedSchematic {
  if (!structure || typeof structure !== "object" || !Array.isArray(structure.blocks) || !structure.blocks.length) {
    throw new SchematicExportError("The accepted structure is empty.");
  }
  const seen = new Set<string>();
  for (const block of structure.blocks) {
    if (![block.x, block.y, block.z].every(Number.isInteger)) throw new SchematicExportError("All block coordinates must be integers.");
    if (typeof block.id !== "string" || !isBlockId(block.id)) throw new SchematicExportError(`Unsupported block ID: ${String(block.id)}.`);
    const key = coordinateKey(block);
    if (seen.has(key)) throw new SchematicExportError(`Duplicate block coordinate: ${key}.`);
    seen.add(key);
  }

  const xs = structure.blocks.map((block) => block.x);
  const ys = structure.blocks.map((block) => block.y);
  const zs = structure.blocks.map((block) => block.z);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const length = maxZ - minZ + 1;
  if ([width, height, length].some((dimension) => dimension < 1 || dimension > 32_767)) {
    throw new SchematicExportError("Schematic dimensions must fit signed 16-bit NBT fields.");
  }
  const volume = width * height * length;
  if (!Number.isSafeInteger(volume) || volume > 16_777_216) {
    throw new SchematicExportError("Schematic volume exceeds the 16,777,216 block export limit.");
  }

  const used = Array.from(new Set(structure.blocks.map((block) => block.id))).sort();
  const palette = new Map<string, number>([["minecraft:air", 0]]);
  used.forEach((blockId, index) => palette.set(blockId, index + 1));
  const indexes = new Uint32Array(volume);
  for (const block of structure.blocks) {
    const x = block.x - minX;
    const y = block.y - minY;
    const z = block.z - minZ;
    const index = x + z * width + y * width * length;
    indexes[index] = palette.get(block.id)!;
  }
  const encoded: number[] = [];
  for (const paletteIndex of indexes) encoded.push(...encodeVarInt(paletteIndex));
  return { width, height, length, offset: [minX, minY, minZ], palette, blockData: Uint8Array.from(encoded) };
}

export function exportSchematic(structure: VoxelStructure, options: SchematicExportOptions = {}): Buffer {
  const minecraftVersion = options.minecraftVersion ?? "1.20.1";
  if (minecraftVersion !== "1.20.1") throw new SchematicExportError(`Unsupported Minecraft version: ${minecraftVersion}.`);
  const schematic = normalizeSchematicStructure(structure);
  const paletteChildren = Array.from(schematic.palette.entries()).map(([blockId, paletteIndex]) => intTag(blockId, paletteIndex));
  const root = compoundTag("Schematic", [
    intTag("Version", SCHEMATIC_FORMAT_VERSION),
    intTag("DataVersion", MINECRAFT_DATA_VERSION_1_20_1),
    shortTag("Width", schematic.width),
    shortTag("Height", schematic.height),
    shortTag("Length", schematic.length),
    intArrayTag("Offset", schematic.offset),
    intTag("PaletteMax", schematic.palette.size),
    compoundTag("Palette", paletteChildren),
    byteArrayTag("BlockData", schematic.blockData),
    emptyCompoundListTag("BlockEntities"),
    compoundTag("Metadata", [
      intTag("WEOffsetX", schematic.offset[0]),
      intTag("WEOffsetY", schematic.offset[1]),
      intTag("WEOffsetZ", schematic.offset[2])
    ])
  ]);
  return gzipSync(root, { level: 9 });
}

export { toSchematicFilename };
