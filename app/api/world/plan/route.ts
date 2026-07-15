import { NextResponse } from "next/server";
import { planWorldWithDeepSeek } from "@/lib/deepseek-world-planner";
import { createLocalWorldPlan, promptSeed } from "@/lib/world-planner";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { prompt?: unknown; seed?: unknown };
    if (typeof body.prompt !== "string" || !body.prompt.trim()) return NextResponse.json({ error: "A district prompt is required." }, { status: 400 });
    const prompt = body.prompt.trim();
    const seed = body.seed === undefined ? promptSeed(prompt) : body.seed;
    if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 0xffffffff) return NextResponse.json({ error: "seed must be an unsigned 32-bit integer." }, { status: 400 });
    const apiKey = request.headers.get("x-deepseek-api-key")?.trim() || process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      try {
        const plan = await planWorldWithDeepSeek(prompt, apiKey, seed as number);
        return NextResponse.json({ plan, metadata: { provider: "deepseek", prompt, seed, planVersion: 1 }, fallback: false });
      } catch (error) {
        console.error("DeepSeek world planning failed; using deterministic fallback.", error);
      }
    }
    const plan = createLocalWorldPlan(prompt, seed as number);
    return NextResponse.json({ plan, metadata: { provider: "local", prompt, seed, planVersion: 1 }, fallback: Boolean(apiKey) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "World planning failed." }, { status: 422 });
  }
}
