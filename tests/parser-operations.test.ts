import assert from "node:assert/strict";
import test from "node:test";
import { applyBuildingOperations } from "../lib/building-operations";
import { generateStructure } from "../lib/generator";
import { parseEditCommand } from "../lib/local-edit-parser";
import { coordinateKey } from "../lib/patches";
import { getBoundingBox, getRoofBlocks } from "../lib/structure-analysis";

test("Chinese roof command only changes identified roof coordinates", () => {
  const structure = generateStructure("medieval cottage");
  const roofKeys = new Set(getRoofBlocks(structure).map(coordinateKey));
  const operations = parseEditCommand("把屋顶加高两层", structure);
  const result = applyBuildingOperations(structure, operations);
  const touchedOld = result.patch.changes.flatMap((change) => change.type === "add" ? [] : [coordinateKey(change.type === "replace" ? change.before : change.block)]);
  assert.ok(touchedOld.every((key) => roofKeys.has(key)));
  assert.ok(result.patch.changes.some((change) => change.type === "add"));
  assert.ok((getBoundingBox(result.structure)?.maxY ?? 0) > (getBoundingBox(structure)?.maxY ?? 0));
  const editedRoofY = Array.from(new Set(getRoofBlocks(result.structure).map((block) => block.y))).sort((a, b) => a - b);
  assert.ok(editedRoofY.every((y, index) => index === 0 || y <= editedRoofY[index - 1] + 1), "roof layers must not float apart");
});

test("combined taller roof and chimney stays vertically continuous", () => {
  const structure = generateStructure("medieval cottage");
  const result = applyBuildingOperations(structure, [
    { type: "resizeRoof", heightDelta: 3 },
    { type: "addChimney", side: "left" }
  ]).structure;
  const roofY = Array.from(new Set(getRoofBlocks(result).map((block) => block.y))).sort((a, b) => a - b);
  assert.ok(roofY.every((y, index) => index === 0 || y <= roofY[index - 1] + 1));
  const leftBrick = result.blocks.filter((block) => block.id === "minecraft:bricks" && block.x < 0);
  const columns = new Map<string, number[]>();
  leftBrick.forEach((block) => columns.set(`${block.x},${block.z}`, [...(columns.get(`${block.x},${block.z}`) ?? []), block.y]));
  assert.ok(Array.from(columns.values()).some((ys) => ys.sort((a, b) => a - b).every((y, index) => index === 0 || y === ys[index - 1] + 1)));
});

test("windows replace wall blocks and do not add exterior blocks", () => {
  const structure = generateStructure("medieval cottage");
  const result = applyBuildingOperations(structure, parseEditCommand("增加三个窗户", structure));
  assert.ok(result.patch.changes.some((change) => change.type === "replace" && change.after.id === "minecraft:glass_pane"));
  assert.equal(result.patch.changes.filter((change) => change.type === "add").length, 0);
});

test("chimney is vertical and path starts at ground in front of door", () => {
  const structure = generateStructure("desert tower");
  const chimney = applyBuildingOperations(structure, parseEditCommand("添加烟囱", structure)).structure;
  const addedBrick = chimney.blocks.filter((block) => block.id === "minecraft:bricks");
  assert.ok(addedBrick.length >= 3);
  const sameColumn = addedBrick.filter((block) => block.x === addedBrick[0].x && block.z === addedBrick[0].z).map((block) => block.y).sort((a, b) => a - b);
  assert.ok(sameColumn.every((y, index) => index === 0 || y === sameColumn[index - 1] + 1));
  const path = applyBuildingOperations(structure, parseEditCommand("门前添加一条石头小路", structure));
  assert.ok(path.patch.changes.some((change) => change.type === "add" && change.block.id === "minecraft:cobblestone" && change.block.y === 0));
});

test("unknown commands fail visibly", () => {
  const structure = generateStructure("medieval cottage");
  assert.throws(() => parseEditCommand("让它更有感觉", structure), /couldn't understand/i);
});
