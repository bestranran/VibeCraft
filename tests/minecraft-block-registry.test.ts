import assert from "node:assert/strict";
import test from "node:test";
import { MINECRAFT_BLOCK_IDS, MINECRAFT_JAVA_VERSION } from "../lib/minecraft-block-registry-1.20.1";
import { exportSchematic, normalizeSchematicStructure } from "../lib/schematic-exporter";
import { BLOCK_IDS, getBlockColor, getBlockLabel, isBlockId } from "../lib/structure";

test("the complete Java 1.20.1 occupied-block registry is available", () => {
  assert.equal(MINECRAFT_JAVA_VERSION, "1.20.1");
  assert.equal(MINECRAFT_BLOCK_IDS.length, 1000);
  assert.equal(new Set(MINECRAFT_BLOCK_IDS).size, MINECRAFT_BLOCK_IDS.length);
  assert.deepEqual(BLOCK_IDS, MINECRAFT_BLOCK_IDS);
  assert.ok(isBlockId("minecraft:red_concrete"));
  assert.ok(isBlockId("minecraft:water"));
  assert.ok(isBlockId("minecraft:decorated_pot"));
  assert.equal(isBlockId("minecraft:air"), false);
  assert.equal(isBlockId("minecraft:block_id"), false);
  assert.equal(isBlockId("minecraft:not_a_real_block"), false);
});

test("every registered block has a usable preview label and color", () => {
  for (const id of MINECRAFT_BLOCK_IDS) {
    assert.ok(getBlockLabel(id).length > 0, id);
    assert.match(getBlockColor(id), /^(?:#[0-9a-f]{6}|hsl\(\d+ 32% 48%\))$/i, id);
  }
});

test("all registered block IDs survive schematic palette serialization", () => {
  const structure = {
    name: "all-java-1-20-1-blocks",
    size: [10, 10, 10] as [number, number, number],
    blocks: MINECRAFT_BLOCK_IDS.map((id, index) => ({
      x: index % 10,
      y: Math.floor(index / 100),
      z: Math.floor(index / 10) % 10,
      id
    }))
  };
  const normalized = normalizeSchematicStructure(structure);
  assert.equal(normalized.palette.size, MINECRAFT_BLOCK_IDS.length + 1);
  for (const id of MINECRAFT_BLOCK_IDS) assert.ok(normalized.palette.has(id), id);
  assert.ok(exportSchematic(structure).byteLength > MINECRAFT_BLOCK_IDS.length);
});
