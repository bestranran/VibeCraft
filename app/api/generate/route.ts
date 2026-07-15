import { NextResponse } from "next/server";
import { DeepSeekBuildScriptError, generateWithDeepSeekBuildScript } from "@/lib/deepseek-build-script-planner";
import { BUILD_SCRIPT_COMPILER_VERSION } from "@/lib/build-script-compiler";
import { generateStructure } from "@/lib/generator";
import { promptSeed } from "@/lib/world-planner";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { prompt?: unknown };
    if (typeof body.prompt !== "string" || !body.prompt.trim()) return NextResponse.json({ error: "A building prompt is required." }, { status: 400 });
    const prompt = body.prompt.trim();
    const seed = promptSeed(prompt);
    const apiKey = request.headers.get("x-deepseek-api-key")?.trim() || process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      try {
        const result = await generateWithDeepSeekBuildScript(prompt, apiKey);
        return NextResponse.json({
          ...result,
          provider: "deepseek-buildscript",
          fallback: false,
          generationMetadata: {
            prompt,
            seed,
            provider: "deepseek-buildscript",
            compilerVersion: BUILD_SCRIPT_COMPILER_VERSION,
            buildScript: result.script,
            operationCount: result.stats.operationCount,
            blockCount: result.stats.blockCount,
            validationWarnings: result.validation.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").map((diagnostic) => diagnostic.message)
          }
        });
      } catch (error) {
        console.error("DeepSeek BuildScript generation failed.", error);
        return NextResponse.json({
          error: error instanceof Error ? error.message : "DeepSeek BuildScript generation failed.",
          ...(error instanceof DeepSeekBuildScriptError ? { diagnostics: error.diagnostics, attempts: error.attempts } : {})
        }, { status: 422 });
      }
    }
    const structure = generateStructure(prompt);
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
