import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { exportWithMcschematic, mcschematicPaths } from "../lib/mcschematic-adapter";
import {
  exportSchematic,
  MINECRAFT_DATA_VERSION_1_20_1,
  normalizeSchematicStructure,
  SCHEMATIC_FORMAT_VERSION,
  SchematicExportError
} from "../lib/schematic-exporter";
import { toSchematicFilename } from "../lib/exporters";
import type { VoxelStructure } from "../lib/structure";

function decodeVarInts(bytes: Uint8Array): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const byte of bytes) {
    value |= (byte & 0x7f) << shift;
    if (byte & 0x80) {
      shift += 7;
      if (shift > 28) throw new Error("Invalid VarInt");
    } else {
      values.push(value >>> 0);
      value = 0;
      shift = 0;
    }
  }
  if (shift) throw new Error("Truncated VarInt");
  return values;
}

function readNbt(binary: Buffer) {
  const data = gunzipSync(binary);
  let offset = 0;
  const byte = () => data[offset++];
  const int16 = () => { const value = data.readInt16BE(offset); offset += 2; return value; };
  const uint16 = () => { const value = data.readUInt16BE(offset); offset += 2; return value; };
  const int32 = () => { const value = data.readInt32BE(offset); offset += 4; return value; };
  const string = () => { const length = uint16(); const value = data.toString("utf8", offset, offset + length); offset += length; return value; };
  const payload = (type: number): unknown => {
    if (type === 2) return int16();
    if (type === 3) return int32();
    if (type === 7) { const length = int32(); const value = data.subarray(offset, offset + length); offset += length; return value; }
    if (type === 8) return string();
    if (type === 9) { const itemType = byte(); const length = int32(); return Array.from({ length }, () => payload(itemType)); }
    if (type === 10) {
      const value: Record<string, unknown> = {};
      while (true) {
        const childType = byte();
        if (childType === 0) break;
        value[string()] = payload(childType);
      }
      return value;
    }
    if (type === 11) { const length = int32(); return Array.from({ length }, int32); }
    throw new Error(`Unsupported test NBT tag ${type}`);
  };
  const rootType = byte();
  const rootName = string();
  const value = payload(rootType) as Record<string, unknown>;
  assert.equal(offset, data.length);
  return { rootType, rootName, value };
}

const sparse: VoxelStructure = {
  name: "Sparse Negative Fixture",
  size: [0, 0, 0],
  blocks: [
    { x: -2, y: 5, z: 10, id: "minecraft:stone_bricks" },
    { x: 0, y: 6, z: 12, id: "minecraft:glass_pane" }
  ]
};

test("normalization preserves negative origin offsets and sparse air cells", () => {
  const normalized = normalizeSchematicStructure(sparse);
  assert.deepEqual([normalized.width, normalized.height, normalized.length], [3, 2, 3]);
  assert.deepEqual(normalized.offset, [-2, 5, 10]);
  assert.equal(normalized.palette.get("minecraft:air"), 0);
  assert.equal(normalized.palette.size, 3);
  const indexes = decodeVarInts(normalized.blockData);
  assert.equal(indexes.length, 18);
  assert.equal(indexes[0], normalized.palette.get("minecraft:stone_bricks"));
  assert.equal(indexes[17], normalized.palette.get("minecraft:glass_pane"));
  assert.equal(indexes.slice(1, 17).every((value) => value === 0), true);
});

test("Sponge v2 NBT contains WorldEdit dimensions, palette, offsets, and block data", () => {
  const binary = exportSchematic(sparse);
  assert.equal(binary[0], 0x1f);
  assert.equal(binary[1], 0x8b);
  const parsed = readNbt(binary);
  assert.equal(parsed.rootType, 10);
  assert.equal(parsed.rootName, "Schematic");
  assert.equal(parsed.value.Version, SCHEMATIC_FORMAT_VERSION);
  assert.equal(parsed.value.DataVersion, MINECRAFT_DATA_VERSION_1_20_1);
  assert.equal(parsed.value.Width, 3);
  assert.equal(parsed.value.Height, 2);
  assert.equal(parsed.value.Length, 3);
  assert.deepEqual(parsed.value.Offset, [-2, 5, 10]);
  assert.equal(parsed.value.PaletteMax, 3);
  assert.deepEqual(parsed.value.BlockEntities, []);
  const palette = parsed.value.Palette as Record<string, number>;
  assert.equal(palette["minecraft:air"], 0);
  assert.ok(palette["minecraft:glass_pane"] > 0);
  assert.ok(palette["minecraft:stone_bricks"] > 0);
  const metadata = parsed.value.Metadata as Record<string, number>;
  assert.deepEqual([metadata.WEOffsetX, metadata.WEOffsetY, metadata.WEOffsetZ], [-2, 5, 10]);
  assert.deepEqual(decodeVarInts(parsed.value.BlockData as Uint8Array), decodeVarInts(normalizeSchematicStructure(sparse).blockData));
});

test("schematic output and filenames are deterministic", () => {
  assert.deepEqual(exportSchematic(sparse), exportSchematic(structuredClone(sparse)));
  assert.equal(toSchematicFilename("  Japanese Tea House  "), "japanese-tea-house.schem");
  assert.equal(toSchematicFilename("茶室"), "vibecraft-structure.schem");
});

test("schematic palettes preserve additional vanilla block IDs", () => {
  const normalized = normalizeSchematicStructure({
    name: "red-object",
    size: [1, 1, 1],
    blocks: [{ x: 0, y: 0, z: 0, id: "minecraft:red_concrete" }]
  });
  assert.ok(normalized.palette.has("minecraft:red_concrete"));
});

test("unsafe or unsupported structures fail before binary serialization", () => {
  assert.throws(() => normalizeSchematicStructure({ name: "empty", size: [0, 0, 0], blocks: [] }), SchematicExportError);
  assert.throws(() => normalizeSchematicStructure({ ...sparse, blocks: [sparse.blocks[0], { ...sparse.blocks[0] }] }), /Duplicate/);
  assert.throws(() => normalizeSchematicStructure({ ...sparse, blocks: [{ x: 0, y: 0, z: 0, id: "mod:diamond_block" as never }] }), /Unsupported block ID/);
  assert.throws(() => exportSchematic(sparse, { minecraftVersion: "1.21" as never }), /Unsupported Minecraft version/);
});

test("the installed mcschematic adapter produces a loadable Sponge v2 payload", { skip: !existsSync(mcschematicPaths().python) }, async () => {
  const exported = await exportWithMcschematic(sparse);
  assert.equal(exported.engine, "mcschematic");
  const parsed = readNbt(exported.binary);
  assert.equal(parsed.rootName, "Schematic");
  assert.equal(parsed.value.Version, 2);
  assert.equal(parsed.value.DataVersion, MINECRAFT_DATA_VERSION_1_20_1);
  assert.deepEqual([parsed.value.Width, parsed.value.Height, parsed.value.Length], [3, 2, 3]);
  const metadata = parsed.value.Metadata as Record<string, number>;
  assert.deepEqual([metadata.WEOffsetX, metadata.WEOffsetY, metadata.WEOffsetZ], [-2, 5, 10]);
  const palette = parsed.value.Palette as Record<string, number>;
  assert.ok("minecraft:stone_bricks" in palette);
  assert.ok("minecraft:glass_pane" in palette);
});
