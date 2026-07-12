import { NextResponse } from "next/server";
import { DeepSeekBuildingPlanner } from "@/lib/deepseek-building-planner";
import { LocalBuildingPlanner } from "@/lib/building-planner";
import type { VoxelStructure } from "@/lib/structure";

type EditRequest = {
  command?: unknown;
  structureSummary?: unknown;
  availableOperations?: unknown;
  structure?: VoxelStructure;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as EditRequest;
    if (typeof body.command !== "string" || !body.command.trim()) return NextResponse.json({ error: "Edit command is required." }, { status: 400 });
    if (typeof body.structureSummary !== "string" || !Array.isArray(body.availableOperations) || !body.structure?.blocks?.length) {
      return NextResponse.json({ error: "A valid structure context is required." }, { status: 400 });
    }
    const input = { command: body.command.trim(), structureSummary: body.structureSummary, availableOperations: body.availableOperations.filter((item): item is string => typeof item === "string") };
    const browserApiKey = request.headers.get("x-deepseek-api-key")?.trim();
    const apiKey = browserApiKey || process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      try {
        const operations = await new DeepSeekBuildingPlanner(apiKey).planEdit(input);
        return NextResponse.json({ operations, provider: "deepseek", fallback: false });
      } catch (error) {
        console.error("DeepSeek planner failed; using local fallback.", error);
      }
    }
    const operations = await new LocalBuildingPlanner().planEdit(input, body.structure);
    return NextResponse.json({ operations, provider: "local", fallback: Boolean(apiKey) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The edit could not be planned.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
