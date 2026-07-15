import { createDeterministicWorldPlan, validateWorldPlanPreferences } from "./world-planner";

const SYSTEM_PROMPT = `You plan bounded Minecraft districts for VibeCraft Studio.
Return JSON only as {"preferences":{...}}. Do not return block coordinates or prose.
The preferences object must contain:
- name: short English slug
- themeName: short theme description
- palette: 2..8 allowed block ids
- roadOrientation: north-south or east-west
- roadWidth: integer 4..8
- lots: exactly 6 objects with purpose residential|commercial|industrial|utility, height 6..42, roof flat|gable, wallMaterial, roofMaterial
- landmarkLot: integer 2..3 identifying the dominant central tower in the middle row
- bridgeRows: exactly two distinct row indices from 0..2
Allowed block ids: minecraft:oak_planks, minecraft:spruce_planks, minecraft:stone_bricks, minecraft:cobblestone, minecraft:glass_pane, minecraft:oak_log, minecraft:spruce_stairs, minecraft:brick, minecraft:sandstone, minecraft:red_sandstone, minecraft:dark_oak_planks, minecraft:lantern.
Use varied heights, a clearly dominant landmark, a coherent palette, and exactly six buildings. Geometry is compiled locally into a safe 64x64 plan.`;

export async function planWorldWithDeepSeek(prompt: string, apiKey: string, seed: number) {
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ prompt, seed }) }
      ]
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`DeepSeek world planning failed (${response.status}).`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty world plan.");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("DeepSeek returned invalid world-plan JSON."); }
  if (!parsed || typeof parsed !== "object" || !("preferences" in parsed)) throw new Error("DeepSeek response is missing world-plan preferences.");
  return createDeterministicWorldPlan(prompt, seed, validateWorldPlanPreferences((parsed as { preferences: unknown }).preferences));
}
