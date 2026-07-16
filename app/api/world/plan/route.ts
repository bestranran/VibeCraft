import { NextResponse } from "next/server";
import { planWorldWithAi } from "@/lib/deepseek-world-planner";
import { createLocalWorldPlan, promptSeed } from "@/lib/world-planner";
import { aiProviderLabel, resolveAiConnection } from "@/lib/ai-provider";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { prompt?: unknown; seed?: unknown };
    if (typeof body.prompt !== "string" || !body.prompt.trim()) return NextResponse.json({ error: "A district prompt is required." }, { status: 400 });
    const prompt = body.prompt.trim();
    const seed = body.seed === undefined ? promptSeed(prompt) : body.seed;
    if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 0xffffffff) return NextResponse.json({ error: "seed must be an unsigned 32-bit integer." }, { status: 400 });
    const connection = resolveAiConnection(request);
    if (connection) {
      try {
        const plan = await planWorldWithAi(connection.provider, prompt, connection.apiKey, seed as number, {
          ...(connection.baseUrl ? { baseUrl: connection.baseUrl } : {}),
          ...(connection.apiMode ? { apiMode: connection.apiMode } : {}),
          ...(connection.model ? { model: connection.model } : {})
        });
        return NextResponse.json({ plan, metadata: { provider: connection.provider, prompt, seed, planVersion: 1 }, fallback: false });
      } catch (error) {
        console.error(`${aiProviderLabel(connection.provider)} world planning failed; using deterministic fallback.`, error);
      }
    }
    const plan = createLocalWorldPlan(prompt, seed as number);
    return NextResponse.json({ plan, metadata: { provider: "local", prompt, seed, planVersion: 1 }, fallback: Boolean(connection) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "World planning failed." }, { status: 422 });
  }
}
