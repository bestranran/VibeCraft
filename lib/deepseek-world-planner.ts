import { createDeterministicWorldPlan, validateWorldPlanPreferences } from "./world-planner";
import { aiProviderLabel, parseAiJson, requestAiText } from "./ai-provider";
import type { AiApiMode, AiProvider } from "./ai-provider";

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
Allowed block ids: minecraft:oak_planks, minecraft:spruce_planks, minecraft:stone_bricks, minecraft:cobblestone, minecraft:glass_pane, minecraft:oak_log, minecraft:spruce_stairs, minecraft:bricks, minecraft:sandstone, minecraft:red_sandstone, minecraft:dark_oak_planks, minecraft:lantern.
Use varied heights, a clearly dominant landmark, a coherent palette, and exactly six buildings. Geometry is compiled locally into a safe 128x128 plan.`;

export async function planWorldWithDeepSeek(prompt: string, apiKey: string, seed: number) {
  return planWorldWithAi("deepseek", prompt, apiKey, seed);
}

export async function planWorldWithAi(provider: AiProvider, prompt: string, apiKey: string, seed: number, options: { baseUrl?: string; apiMode?: AiApiMode; model?: string } = {}) {
  const providerName = aiProviderLabel(provider);
  const content = await requestAiText({
    provider,
    apiKey,
    temperature: 0.25,
    maxTokens: 2048,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.apiMode ? { apiMode: options.apiMode } : {}),
    ...(options.model ? { model: options.model } : {}),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ prompt, seed }) }
    ]
  });
  let parsed: unknown;
  try { parsed = parseAiJson(content); } catch { throw new Error(`${providerName} returned invalid world-plan JSON.`); }
  if (!parsed || typeof parsed !== "object" || !("preferences" in parsed)) throw new Error(`${providerName} response is missing world-plan preferences.`);
  return createDeterministicWorldPlan(prompt, seed, validateWorldPlanPreferences((parsed as { preferences: unknown }).preferences));
}
