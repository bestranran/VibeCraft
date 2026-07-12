import { NextResponse } from "next/server";
import { planBuildingWithDeepSeek } from "@/lib/deepseek-generation-planner";
import { generateFromSpec } from "@/lib/parameterized-generator";
import { generateStructure } from "@/lib/generator";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { prompt?: unknown };
    if (typeof body.prompt !== "string" || !body.prompt.trim()) return NextResponse.json({ error: "A building prompt is required." }, { status: 400 });
    const apiKey = request.headers.get("x-deepseek-api-key")?.trim() || process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      try {
        const spec = await planBuildingWithDeepSeek(body.prompt.trim(), apiKey);
        return NextResponse.json({ structure: generateFromSpec(spec), spec, provider: "deepseek", fallback: false });
      } catch (error) { console.error("DeepSeek generation failed; using local template.", error); }
    }
    return NextResponse.json({ structure: generateStructure(body.prompt), provider: "local", fallback: Boolean(apiKey) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed." }, { status: 422 });
  }
}
