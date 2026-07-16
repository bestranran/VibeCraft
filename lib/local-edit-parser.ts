import type { BlockId, BuildingOperation, VoxelStructure } from "./structure";

export class EditParseError extends Error {}

const materials: Array<[RegExp, BlockId]> = [
  [/(stone bricks?|石砖)/i, "minecraft:stone_bricks"],
  [/(cobblestone|圆石|石头)/i, "minecraft:cobblestone"],
  [/(red sandstone|红砂岩)/i, "minecraft:red_sandstone"],
  [/(sandstone|砂岩)/i, "minecraft:sandstone"],
  [/(dark oak|深色橡木|深色木)/i, "minecraft:dark_oak_planks"],
  [/(spruce|云杉)/i, "minecraft:spruce_planks"],
  [/(brick|红砖|砖块)/i, "minecraft:bricks"],
  [/(oak|橡木|木板)/i, "minecraft:oak_planks"]
];

function numberFrom(text: string, fallback: number) {
  const digit = text.match(/\d+/)?.[0];
  if (digit) return Number(digit);
  const chinese: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 };
  const match = text.match(/[一两二三四五六七八]/)?.[0];
  return match ? chinese[match] : fallback;
}

function materialFrom(text: string, fallback: BlockId): BlockId {
  return materials.find(([pattern]) => pattern.test(text))?.[1] ?? fallback;
}

export function parseEditCommand(prompt: string, structure: VoxelStructure): BuildingOperation[] {
  const text = prompt.trim();
  if (!text) throw new EditParseError("Describe the change you want to make.");
  if (!structure.blocks.length) throw new EditParseError("Generate a building before editing it.");
  const operations: BuildingOperation[] = [];
  const removing = /(remove|delete|去掉|移除|删除)/i.test(text);

  if (removing && /(chimney|烟囱)/i.test(text)) operations.push({ type: "removeFeature", feature: "chimney" });
  else if (removing && /(path|road|小路|道路)/i.test(text)) operations.push({ type: "removeFeature", feature: "path" });
  else if (removing && /(windows?|窗户|窗)/i.test(text)) operations.push({ type: "removeFeature", feature: "windows" });

  if (!removing && /(roof.*(taller|higher|raise)|屋顶.*(加高|更高|抬高))/i.test(text)) {
    operations.push({ type: "resizeRoof", heightDelta: numberFrom(text, 2) });
  }
  if (!removing && /(add|more|增加|添加|加).*(windows?|窗户|窗)/i.test(text)) {
    const side = /(back|后面|背面)/i.test(text) ? "back" : /(left|左侧|左边)/i.test(text) ? "left" : /(right|右侧|右边)/i.test(text) ? "right" : /(all|四面|所有)/i.test(text) ? "all" : "front";
    operations.push({ type: "addWindows", side, count: numberFrom(text, 3) });
  }
  if (!removing && /(add|添加|增加|加).*(chimney|烟囱)/i.test(text)) {
    operations.push({ type: "addChimney", side: /(left|左)/i.test(text) ? "left" : "right" });
  }
  if (!removing && /(add|添加|增加|加).*(path|road|小路|道路)/i.test(text)) {
    operations.push({ type: "addPath", length: numberFrom(text, 6), width: /(wide|宽|两格|2格)/i.test(text) ? 2 : 1, material: materialFrom(text, "minecraft:cobblestone") });
  }
  if (!removing && /(add|添加|增加|加).*(floor|storey|story|层)/i.test(text) && !/(roof|屋顶)/i.test(text)) {
    operations.push({ type: "addFloor", count: numberFrom(text, 1) });
  }

  const paletteIntent = /(replace|change|swap|换成|替换|改成|配色)/i.test(text);
  if (paletteIntent) {
    const to = materialFrom(text, "minecraft:dark_oak_planks");
    const region = /(roof|屋顶)/i.test(text) ? "roof" : /(first floor|ground floor|一楼|foundation|地基)/i.test(text) ? "foundation" : /(wall|墙|主体)/i.test(text) ? "walls" : "all";
    const fromMatch = text.match(/(?:replace|把)\s*([^,，]+?)\s*(?:with|换成)/i)?.[1] ?? "";
    const from = fromMatch ? materialFrom(fromMatch, to) : undefined;
    operations.push({ type: "changePalette", ...(from && from !== to ? { from } : {}), to, region });
  }

  if (!operations.length) {
    throw new EditParseError("I couldn't understand that edit. Try “make the roof 2 blocks taller”, “add 3 windows”, “add a chimney”, or “add a stone path”.");
  }
  return operations;
}
