import { intlLocale, type Locale } from "./config";
import { en, type MessageKey } from "./messages/en";
import { zhCN } from "./messages/zh-CN";

export const messages: Record<Locale, Record<MessageKey, string>> = {
  en,
  "zh-CN": zhCN
};

export type MessageValues = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, values: MessageValues = {}) {
  return messages[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder
  );
}

export function pluralKey(locale: Locale, key: string, count: number) {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  return `${key}.${category === "one" ? "one" : "other"}` as MessageKey;
}

export function blockLabel(locale: Locale, id: string) {
  const name = id.replace(/^minecraft:/, "");
  const key = `blocks.${name}` as MessageKey;
  if (key in messages[locale]) return messages[locale][key];
  if (locale === "zh-CN") return name;
  return name.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

const zhCNIdentifiers: Record<string, string> = {
  "medieval-cottage": "中世纪小屋",
  "japanese-tea-house": "日式茶屋",
  "desert-sandstone-tower": "沙漠砂岩塔",
  "empty-scene": "空场景",
  "cyberpunk-district": "赛博朋克城区",
  "vibecraft-district": "VibeCraft 城区",
  "industrial cyberpunk": "工业赛博朋克",
  "dense cyberpunk": "高密度赛博朋克",
  "district": "城区"
};

export function formatIdentifier(locale: Locale, value: string) {
  if (locale === "zh-CN" && zhCNIdentifiers[value]) return zhCNIdentifiers[value];
  return value.replace(/[-_]/g, " ");
}
