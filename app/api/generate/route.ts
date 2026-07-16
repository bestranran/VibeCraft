import { NextResponse } from "next/server";
import { createAiBuildScriptChat, DeepSeekBuildScriptError, generateWithDeepSeekBuildScript } from "@/lib/deepseek-build-script-planner";
import { BUILD_SCRIPT_COMPILER_VERSION } from "@/lib/build-script-compiler";
import { generateStructure, placeStructureInScene } from "@/lib/generator";
import { promptSeed } from "@/lib/world-planner";
import { aiProviderLabel, resolveAiConnection } from "@/lib/ai-provider";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { prompt?: unknown };
    if (typeof body.prompt !== "string" || !body.prompt.trim()) return NextResponse.json({ error: "A building prompt is required." }, { status: 400 });
    const prompt = body.prompt.trim();
    const seed = promptSeed(prompt);
    const connection = resolveAiConnection(request);
    if (connection) {
      const providerName = aiProviderLabel(connection.provider);
      const provider = `${connection.provider}-buildscript` as "deepseek-buildscript" | "claude-buildscript";
      try {
        const result = await generateWithDeepSeekBuildScript(prompt, connection.apiKey, {
          chat: createAiBuildScriptChat(connection.provider, connection.apiKey, {
            ...(connection.baseUrl ? { baseUrl: connection.baseUrl } : {}),
            ...(connection.apiMode ? { apiMode: connection.apiMode } : {}),
            ...(connection.model ? { model: connection.model } : {})
          }),
          providerName
        });
        return NextResponse.json({
          ...result,
          provider,
          fallback: false,
          generationMetadata: {
            prompt,
            seed,
            provider,
            compilerVersion: BUILD_SCRIPT_COMPILER_VERSION,
            buildScript: result.script,
            operationCount: result.stats.operationCount,
            blockCount: result.stats.blockCount,
            validationWarnings: result.validation.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").map((diagnostic) => diagnostic.message)
          }
        });
      } catch (error) {
        console.error(`${providerName} BuildScript generation failed.`, error);
        return NextResponse.json({
          error: error instanceof Error ? error.message : `${providerName} BuildScript generation failed.`,
          ...(error instanceof DeepSeekBuildScriptError ? { diagnostics: error.diagnostics, attempts: error.attempts } : {})
        }, { status: 422 });
      }
    }
    const structure = placeStructureInScene(generateStructure(prompt));
    return NextResponse.json({
      structure,
      provider: "local",
      fallback: true,
      generationMetadata: {
        prompt,
        seed,
        provider: "local",
        compilerVersion: "local-generator-v1",
        operationCount: 0,
        blockCount: structure.blocks.length,
        validationWarnings: []
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed." }, { status: 422 });
  }
}
