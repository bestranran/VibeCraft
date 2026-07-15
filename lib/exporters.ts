import type { VoxelStructure } from "./structure";

function coord(value: number) {
  return `~${value}`;
}

export function exportMcFunction(structure: VoxelStructure): string {
  const header = [
    `# VibeCraft Studio export: ${structure.name}`,
    `# Size: ${structure.size.join(" x ")}`,
    `# Blocks: ${structure.blocks.length}`
  ];

  const commands = structure.blocks.map(
    (block) => `setblock ${coord(block.x)} ${coord(block.y)} ${coord(block.z)} ${block.id}`
  );

  return [...header, ...commands].join("\n");
}

export function toMcFunctionFilename(name: string) {
  return `${exportFilenameBase(name)}.mcfunction`;
}

export function toSchematicFilename(name: string) {
  return `${exportFilenameBase(name)}.schem`;
}

function exportFilenameBase(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "vibecraft-structure";
}
