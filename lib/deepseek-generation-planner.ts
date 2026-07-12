import { validateBuildingSpec } from "./building-spec";

const SYSTEM = `You design compact, attractive Minecraft buildings. Return JSON only as {"spec": BuildingSpec}.
BuildingSpec fields: name (English slug-like name), style medieval|japanese|desert|rustic, odd width 7..17, odd depth 7..15, floors 1..3, wallHeight 4..11, roof {type gable|hip|flat,height 1..7,overhang 0..2}, features array from chimney|porch|path|lanterns, palette {foundation,walls,roof,accent}.
Allowed block ids: minecraft:oak_planks, minecraft:spruce_planks, minecraft:stone_bricks, minecraft:cobblestone, minecraft:glass_pane, minecraft:oak_log, minecraft:spruce_stairs, minecraft:brick, minecraft:sandstone, minecraft:red_sandstone, minecraft:dark_oak_planks, minecraft:lantern.
Choose harmonious materials and sensible proportions. Medieval/rustic usually use a gable roof; Japanese uses a low hip roof; desert towers use flat roofs. Do not output voxel coordinates.`;

export async function planBuildingWithDeepSeek(prompt: string, apiKey: string) {
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || "deepseek-chat", temperature: 0.35, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }] }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`DeepSeek generation failed (${response.status}).`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty building plan.");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("DeepSeek returned invalid JSON."); }
  if (typeof parsed !== "object" || parsed === null || !("spec" in parsed)) throw new Error("DeepSeek response is missing a building spec.");
  return validateBuildingSpec((parsed as { spec: unknown }).spec);
}
