import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrency, formatDate, formatNumber, formatTime } from "../i18n/formatters";
import { blockLabel, formatIdentifier, pluralKey, translate } from "../i18n/resources";

test("provides complete English and Simplified Chinese messages", () => {
  assert.equal(translate("zh-CN", "prompt.generate"), "生成建筑");
  assert.equal(translate("en", "prompt.generate"), "Generate building");
  assert.equal(translate("zh-CN", "plan.summary", { lots: 6, bridges: 2, provider: "本地", seed: 42 }), "6 块用地 · 2 座桥 · 本地 · 种子 42");
});

test("uses locale-aware plural selection and block labels", () => {
  assert.equal(pluralKey("en", "canvas.blocks", 1), "canvas.blocks.one");
  assert.equal(pluralKey("en", "canvas.blocks", 2), "canvas.blocks.other");
  assert.equal(blockLabel("zh-CN", "minecraft:stone_bricks"), "石砖");
  assert.equal(blockLabel("en", "minecraft:stone_bricks"), "Stone Bricks");
  assert.equal(formatIdentifier("zh-CN", "desert-sandstone-tower"), "沙漠砂岩塔");
  assert.equal(formatIdentifier("en", "desert-sandstone-tower"), "desert sandstone tower");
});

test("formats numbers, dates, times, and currency by locale", () => {
  assert.equal(formatNumber("en", 1234567), "1,234,567");
  assert.equal(formatNumber("zh-CN", 1234567), "1,234,567");
  assert.match(formatCurrency("en", 1234.5, "USD"), /\$1,234\.50/);
  assert.match(formatCurrency("zh-CN", 1234.5, "CNY"), /1,234\.50/);
  const instant = Date.UTC(2026, 6, 16, 9, 5);
  assert.match(formatDate("en", instant, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }), /Jul 16, 2026/);
  assert.match(formatDate("zh-CN", instant, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }), /2026年7月16日/);
  assert.match(formatTime("en", instant, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }), /09:05/);
  assert.match(formatTime("zh-CN", instant, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }), /09:05/);
});
