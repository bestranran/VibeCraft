import type { BlockId, VoxelBlock, VoxelStructure } from "./structure";

type Builder = {
  set: (x: number, y: number, z: number, id: BlockId) => void;
  remove: (x: number, y: number, z: number) => void;
  blocks: () => VoxelBlock[];
};

function createBuilder(): Builder {
  const map = new Map<string, VoxelBlock>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

  return {
    set: (x, y, z, id) => {
      map.set(key(x, y, z), { x, y, z, id });
    },
    remove: (x, y, z) => {
      map.delete(key(x, y, z));
    },
    blocks: () =>
      Array.from(map.values()).sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)
  };
}

function fill(builder: Builder, from: [number, number, number], to: [number, number, number], id: BlockId) {
  for (let x = from[0]; x <= to[0]; x += 1) {
    for (let y = from[1]; y <= to[1]; y += 1) {
      for (let z = from[2]; z <= to[2]; z += 1) {
        builder.set(x, y, z, id);
      }
    }
  }
}

function floorRect(builder: Builder, x0: number, x1: number, z0: number, z1: number, y: number, id: BlockId) {
  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) {
      builder.set(x, y, z, id);
    }
  }
}

function hollowWalls(
  builder: Builder,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  id: BlockId
) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      builder.set(x, y, z0, id);
      builder.set(x, y, z1, id);
    }
    for (let z = z0 + 1; z < z1; z += 1) {
      builder.set(x0, y, z, id);
      builder.set(x1, y, z, id);
    }
  }
}

function addMedievalCottage(): VoxelStructure {
  const b = createBuilder();
  floorRect(b, -4, 4, -3, 3, 0, "minecraft:stone_bricks");
  hollowWalls(b, -4, 4, -3, 3, 1, 4, "minecraft:oak_planks");

  for (const [x, z] of [
    [-4, -3],
    [4, -3],
    [-4, 3],
    [4, 3]
  ]) {
    fill(b, [x, 1, z], [x, 5, z], "minecraft:oak_log");
  }

  for (let y = 1; y <= 2; y += 1) {
    b.remove(0, y, -3);
  }
  for (const x of [-2, 2]) {
    b.set(x, 2, -3, "minecraft:glass_pane");
    b.set(x, 3, -3, "minecraft:glass_pane");
    b.set(x, 2, 3, "minecraft:glass_pane");
  }
  b.set(-4, 2, 0, "minecraft:glass_pane");
  b.set(4, 2, 0, "minecraft:glass_pane");

  for (let layer = 0; layer <= 3; layer += 1) {
    const zMin = -4 + layer;
    const zMax = 4 - layer;
    const y = 5 + layer;
    for (let x = -5; x <= 5; x += 1) {
      b.set(x, y, zMin, "minecraft:spruce_stairs");
      b.set(x, y, zMax, "minecraft:spruce_stairs");
    }
  }
  for (let x = -4; x <= 4; x += 1) {
    b.set(x, 8, 0, "minecraft:spruce_planks");
  }

  fill(b, [3, 5, 1], [3, 8, 1], "minecraft:bricks");
  b.set(3, 9, 1, "minecraft:cobblestone");

  return { name: "medieval-cottage", size: [11, 10, 9], blocks: b.blocks() };
}

function addJapaneseTeaHouse(): VoxelStructure {
  const b = createBuilder();
  floorRect(b, -5, 5, -4, 4, 0, "minecraft:stone_bricks");
  floorRect(b, -4, 4, -3, 3, 1, "minecraft:dark_oak_planks");

  for (const [x, z] of [
    [-4, -3],
    [4, -3],
    [-4, 3],
    [4, 3]
  ]) {
    fill(b, [x, 2, z], [x, 5, z], "minecraft:oak_log");
  }

  hollowWalls(b, -3, 3, -2, 2, 2, 4, "minecraft:spruce_planks");
  for (let y = 2; y <= 3; y += 1) {
    b.remove(0, y, -2);
  }
  for (const x of [-2, 2]) {
    b.set(x, 3, -2, "minecraft:glass_pane");
    b.set(x, 3, 2, "minecraft:glass_pane");
  }

  for (let x = -6; x <= 6; x += 1) {
    for (let z = -5; z <= 5; z += 1) {
      const edge = Math.abs(x) === 6 || Math.abs(z) === 5;
      const inner = Math.abs(x) <= 4 && Math.abs(z) <= 3;
      if (edge || inner) {
        b.set(x, 5, z, edge ? "minecraft:dark_oak_planks" : "minecraft:spruce_stairs");
      }
    }
  }
  floorRect(b, -4, 4, -3, 3, 6, "minecraft:spruce_stairs");
  floorRect(b, -2, 2, -1, 1, 7, "minecraft:dark_oak_planks");

  for (let z = -8; z <= -3; z += 1) {
    b.set(0, 0, z, "minecraft:cobblestone");
    if (z % 2 === 0) {
      b.set(-2, 1, z, "minecraft:lantern");
      b.set(2, 1, z, "minecraft:lantern");
    }
  }

  return { name: "japanese-tea-house", size: [13, 8, 14], blocks: b.blocks() };
}

function addDesertTower(): VoxelStructure {
  const b = createBuilder();
  floorRect(b, -4, 4, -4, 4, 0, "minecraft:red_sandstone");

  for (let y = 1; y <= 10; y += 1) {
    const radius = y > 8 ? 3 : 4;
    for (let x = -radius; x <= radius; x += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        const onWall = Math.abs(x) === radius || Math.abs(z) === radius;
        if (onWall) {
          const accent = (Math.abs(x) === radius && Math.abs(z) === radius) || y % 4 === 0;
          b.set(x, y, z, accent ? "minecraft:red_sandstone" : "minecraft:sandstone");
        }
      }
    }
  }

  for (let y = 1; y <= 2; y += 1) {
    b.remove(0, y, -4);
  }
  for (const [x, z] of [
    [0, 4],
    [-4, 0],
    [4, 0]
  ]) {
    b.set(x, 5, z, "minecraft:glass_pane");
    b.set(x, 6, z, "minecraft:glass_pane");
  }

  for (let x = -5; x <= 5; x += 1) {
    b.set(x, 11, -5, "minecraft:red_sandstone");
    b.set(x, 11, 5, "minecraft:red_sandstone");
  }
  for (let z = -4; z <= 4; z += 1) {
    b.set(-5, 11, z, "minecraft:red_sandstone");
    b.set(5, 11, z, "minecraft:red_sandstone");
  }
  for (const [x, z] of [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4]
  ]) {
    fill(b, [x, 12, z], [x, 13, z], "minecraft:sandstone");
  }
  b.set(0, 12, 0, "minecraft:lantern");

  return { name: "desert-sandstone-tower", size: [11, 14, 11], blocks: b.blocks() };
}

export function generateStructure(prompt: string): VoxelStructure {
  const normalized = prompt.toLowerCase();

  if (/(medieval|cottage|cozy)/.test(normalized)) {
    return addMedievalCottage();
  }

  if (/(japanese|tea house|teahouse)/.test(normalized)) {
    return addJapaneseTeaHouse();
  }

  if (/(desert|sandstone|tower)/.test(normalized)) {
    return addDesertTower();
  }

  return addMedievalCottage();
}

export function placeStructureInScene(structure: VoxelStructure): VoxelStructure {
  if (!structure.blocks.length) return { ...structure, size: [...structure.size], blocks: [] };
  const minX = Math.min(...structure.blocks.map((block) => block.x));
  const maxX = Math.max(...structure.blocks.map((block) => block.x));
  const minY = Math.min(...structure.blocks.map((block) => block.y));
  const maxY = Math.max(...structure.blocks.map((block) => block.y));
  const minZ = Math.min(...structure.blocks.map((block) => block.z));
  const maxZ = Math.max(...structure.blocks.map((block) => block.z));
  if (maxX - minX >= 128 || maxY - minY >= 128 || maxZ - minZ >= 128) throw new Error("The local fixture does not fit inside the 128×128×128 scene.");
  const offsetX = Math.floor((63 - (maxX - minX)) / 2) - minX;
  const offsetY = minY < 0 ? -minY : 0;
  const offsetZ = Math.floor((63 - (maxZ - minZ)) / 2) - minZ;
  return {
    ...structure,
    size: [...structure.size],
    blocks: structure.blocks.map((block) => ({ ...block, x: block.x + offsetX, y: block.y + offsetY, z: block.z + offsetZ }))
  };
}
