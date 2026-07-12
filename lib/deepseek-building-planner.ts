import type { BuildingPlanner } from "./building-planner";
import { validateBuildingOperations } from "./operation-validation";

const SYSTEM_PROMPT = `You are the planning brain for VibeCraft Studio, a Minecraft building editor.
Convert the user's Chinese or English edit request into safe, minimal JSON operations. Change only what was requested.
Return JSON only in this exact shape: {"operations": [...]}.
Allowed operations and bounds:
- {"type":"resizeRoof","heightDelta":-3..5}
- {"type":"addWindows","side":"front|back|left|right|all","count":1..12}
- {"type":"addChimney","side":"left|right"}
- {"type":"addPath","length":1..24,"width":1..5,"material":"valid block id"}
- {"type":"changePalette","from":"optional block id","to":"block id","region":"all|walls|roof|foundation"}
- {"type":"addFloor","count":1..2}
- {"type":"removeFeature","feature":"chimney|path|windows"}
Never invent operations or block ids. Use only the available operations and palette supplied by the application. Return at most 6 operations.`;

export class DeepSeekBuildingPlanner implements BuildingPlanner {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.DEEPSEEK_MODEL || "deepseek-chat",
    private readonly baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  ) {}

  async planEdit(input: Parameters<BuildingPlanner["planEdit"]>[0]) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(input) }
        ]
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`DeepSeek request failed (${response.status}): ${detail.slice(0, 240)}`);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned an empty response.");
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error("DeepSeek returned invalid JSON."); }
    if (typeof parsed !== "object" || parsed === null || !("operations" in parsed)) throw new Error("DeepSeek response is missing operations.");
    return validateBuildingOperations((parsed as { operations: unknown }).operations);
  }
}
