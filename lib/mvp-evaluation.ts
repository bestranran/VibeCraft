import { applyBuildingOperations } from "./building-operations";
import { acceptPendingEdit, createBuildingDocument, redoDocument, setPendingEdit, undoDocument } from "./building-document";
import { compileBuildScript } from "./build-script-compiler";
import { exportWithMcschematic, isMcschematicAvailable } from "./mcschematic-adapter";
import { parseEditCommand } from "./local-edit-parser";
import { exportSchematic } from "./schematic-exporter";
import type { BuildScript, BuildScriptOperation } from "./build-script";
import type { BlockId } from "./structure";

export type EvaluationStyle = "medieval" | "japanese" | "desert" | "modern" | "cyberpunk";

export type MvpEvaluationCase = {
  style: EvaluationStyle;
  prompt: string;
  script: BuildScript;
  expectedRoof: "gableRoof" | "flatRoof";
  expectedMaterials: BlockId[];
  expectedFeature?: BuildScriptOperation["type"];
};

export type MvpEvaluationCaseResult = {
  style: EvaluationStyle;
  prompt: string;
  passed: boolean;
  blockCount: number;
  size: [number, number, number];
  paletteSize: number;
  deterministic: boolean;
  structurallyValid: boolean;
  recognizableSilhouette: boolean;
  styleAdherent: boolean;
  validEntrance: boolean;
  hollowInterior: boolean;
  connectedRoof: boolean;
  materialContrast: boolean;
  schematicExport: boolean;
  diagnostics: string[];
};

export type MvpEvaluationReport = {
  cases: MvpEvaluationCaseResult[];
  automatedReady: boolean;
  releaseReady: boolean;
  schematicEngine: "mcschematic" | "builtin";
  metrics: {
    compilationSuccessRate: number;
    structuralSuccessRate: number;
    determinismRate: number;
    styleAdherenceRate: number;
    schematicSuccessRate: number;
    distinctSilhouettes: number;
    editHistoryCorrect: boolean;
    externalWorldEditVerified: boolean;
  };
};

type FixtureConfig = {
  style: EvaluationStyle;
  prompt: string;
  size: [number, number, number];
  base: BlockId;
  wall: BlockId;
  roof: BlockId;
  roofType: "gableRoof" | "flatRoof";
  roofHeight?: number;
  overhang?: number;
  feature?: "porch" | "path";
};

function fixture(config: FixtureConfig): MvpEvaluationCase {
  const operations: BuildScriptOperation[] = [
    { type: "foundation", id: "base", origin: [17, 0, 17], size: [22, 1, 20], material: config.base },
    { type: "hollowBox", id: "main", origin: [20, 1, 20], size: config.size, wall: config.wall, floor: config.base },
    config.roofType === "gableRoof"
      ? { type: "gableRoof", id: "roof", target: "main", height: config.roofHeight ?? 4, overhang: config.overhang ?? 1, material: config.roof }
      : { type: "flatRoof", id: "roof", target: "main", overhang: config.overhang ?? 0, thickness: config.style === "cyberpunk" ? 2 : 1, material: config.roof },
    { type: "entrance", id: "door", target: "main", side: "front", width: 2, height: 3 },
    { type: "windows", id: "windows", target: "main", side: config.style === "modern" ? "all" : "front", count: config.style === "modern" ? 3 : 2, width: config.style === "modern" ? 2 : 1, height: 2, sillHeight: config.style === "desert" ? 5 : 2, material: "minecraft:glass_pane" }
  ];
  if (config.feature === "porch") operations.push({ type: "porch", id: "porch", target: "main", side: "front", width: 8, depth: 2, material: config.base });
  if (config.feature === "path") operations.push({ type: "path", id: "path", target: "door", length: 6, width: 3, material: config.roof });
  return {
    style: config.style,
    prompt: config.prompt,
    script: {
      version: 1,
      name: `${config.style}-evaluation-build`,
      bounds: { width: 64, depth: 64, maxHeight: 64 },
      palette: { base: config.base, wall: config.wall, roof: config.roof, glass: "minecraft:glass_pane" },
      operations
    },
    expectedRoof: config.roofType,
    expectedMaterials: [config.base, config.wall, config.roof],
    ...(config.feature ? { expectedFeature: config.feature } : {})
  };
}

export const MVP_EVALUATION_CASES: MvpEvaluationCase[] = [
  fixture({ style: "medieval", prompt: "Build a medieval cottage with a stone base, timber walls, steep gable roof, windows, and a clear entrance.", size: [14, 8, 12], base: "minecraft:cobblestone", wall: "minecraft:oak_planks", roof: "minecraft:spruce_planks", roofType: "gableRoof", roofHeight: 5 }),
  fixture({ style: "japanese", prompt: "Build a Japanese house with dark timber, broad layered eaves, a veranda, paper-like windows, and a centered entrance.", size: [16, 7, 12], base: "minecraft:stone_bricks", wall: "minecraft:dark_oak_planks", roof: "minecraft:spruce_planks", roofType: "gableRoof", roofHeight: 4, overhang: 2, feature: "porch" }),
  fixture({ style: "desert", prompt: "Build a tall desert watchtower with sandstone walls, red sandstone accents, sparse high windows, and a flat roof.", size: [10, 13, 10], base: "minecraft:red_sandstone", wall: "minecraft:sandstone", roof: "minecraft:red_sandstone", roofType: "flatRoof", overhang: 1 }),
  fixture({ style: "modern", prompt: "Build a wide modern villa with gray concrete walls, a thin metal flat roof, large window bands, and an offset facade.", size: [18, 7, 12], base: "minecraft:stone_bricks", wall: "minecraft:gray_concrete", roof: "minecraft:iron_block", roofType: "flatRoof", overhang: 1 }),
  fixture({ style: "cyberpunk", prompt: "Build a compact cyberpunk shop with black and cyan concrete, magenta roof accents, glass frontage, and a bright approach path.", size: [13, 9, 11], base: "minecraft:black_concrete", wall: "minecraft:cyan_concrete", roof: "minecraft:magenta_concrete", roofType: "flatRoof", overhang: 1, feature: "path" })
];

function ratio(count: number, total: number) {
  return total ? Math.round((count / total) * 1000) / 1000 : 0;
}

function evaluateEditHistory(script: BuildScript) {
  const compilation = compileBuildScript(script);
  const initial = createBuildingDocument(compilation.structure);
  const operations = parseEditCommand("add a chimney on the right", initial.structure);
  const edited = applyBuildingOperations(initial.structure, operations);
  const accepted = acceptPendingEdit(setPendingEdit(initial, { prompt: "add a chimney on the right", operations, patch: edited.patch, preview: edited.structure }), { id: "evaluation-edit", createdAt: 1 });
  const undone = undoDocument(accepted);
  const redone = redoDocument(undone);
  return JSON.stringify(undone.structure) === JSON.stringify(initial.structure)
    && JSON.stringify(redone.structure) === JSON.stringify(edited.structure)
    && accepted.history.length === 1;
}

export async function runMvpEvaluation(options: { preferMcschematic?: boolean; externalWorldEditVerified?: boolean } = {}): Promise<MvpEvaluationReport> {
  const preferMcschematic = options.preferMcschematic ?? true;
  const useMcschematic = preferMcschematic && await isMcschematicAvailable();
  const cases: MvpEvaluationCaseResult[] = [];
  for (const evaluation of MVP_EVALUATION_CASES) {
    const diagnostics: string[] = [];
    try {
      const first = compileBuildScript(evaluation.script);
      const second = compileBuildScript(structuredClone(evaluation.script));
      const deterministic = JSON.stringify(first.structure) === JSON.stringify(second.structure);
      const validationCodes = new Set(first.validation.diagnostics.filter((item) => item.severity === "error").map((item) => item.code));
      const validEntrance = !validationCodes.has("MISSING_ENTRANCE") && !validationCodes.has("BLOCKED_ENTRANCE");
      const hollowInterior = !validationCodes.has("OCCUPIED_INTERIOR") && first.validation.metrics.hollowInteriorRatio >= 0.95;
      const connectedRoof = !validationCodes.has("DISCONNECTED_ROOF") && !validationCodes.has("DETACHED_ROOF");
      const materialContrast = first.validation.metrics.paletteSize >= 3;
      const recognizableSilhouette = first.structure.blocks.length >= 150 && first.structure.size[0] >= 8 && first.structure.size[1] >= 6 && first.structure.size[2] >= 8;
      const used = new Set(first.structure.blocks.map((block) => block.id));
      const styleAdherent = evaluation.script.operations.some((operation) => operation.type === evaluation.expectedRoof)
        && evaluation.expectedMaterials.every((material) => used.has(material))
        && (!evaluation.expectedFeature || evaluation.script.operations.some((operation) => operation.type === evaluation.expectedFeature));
      let schematicExport = false;
      try {
        const binary = useMcschematic ? (await exportWithMcschematic(first.structure)).binary : exportSchematic(first.structure);
        schematicExport = binary.length > 2 && binary[0] === 0x1f && binary[1] === 0x8b;
      } catch (error) {
        diagnostics.push(error instanceof Error ? error.message : "Schematic export failed.");
      }
      diagnostics.push(...first.validation.diagnostics.map((item) => `${item.severity}: ${item.message}`));
      const structurallyValid = first.validation.valid;
      const passed = deterministic && structurallyValid && recognizableSilhouette && styleAdherent && validEntrance && hollowInterior && connectedRoof && materialContrast && schematicExport;
      cases.push({ style: evaluation.style, prompt: evaluation.prompt, passed, blockCount: first.stats.blockCount, size: first.structure.size, paletteSize: first.validation.metrics.paletteSize, deterministic, structurallyValid, recognizableSilhouette, styleAdherent, validEntrance, hollowInterior, connectedRoof, materialContrast, schematicExport, diagnostics });
    } catch (error) {
      cases.push({ style: evaluation.style, prompt: evaluation.prompt, passed: false, blockCount: 0, size: [0, 0, 0], paletteSize: 0, deterministic: false, structurallyValid: false, recognizableSilhouette: false, styleAdherent: false, validEntrance: false, hollowInterior: false, connectedRoof: false, materialContrast: false, schematicExport: false, diagnostics: [error instanceof Error ? error.message : "Evaluation compilation failed."] });
    }
  }
  const silhouettes = new Set(cases.map((item) => `${item.size.join("x")}:${item.blockCount}`)).size;
  const editHistoryCorrect = evaluateEditHistory(MVP_EVALUATION_CASES[0].script);
  const metrics = {
    compilationSuccessRate: ratio(cases.filter((item) => item.blockCount > 0).length, cases.length),
    structuralSuccessRate: ratio(cases.filter((item) => item.structurallyValid).length, cases.length),
    determinismRate: ratio(cases.filter((item) => item.deterministic).length, cases.length),
    styleAdherenceRate: ratio(cases.filter((item) => item.styleAdherent).length, cases.length),
    schematicSuccessRate: ratio(cases.filter((item) => item.schematicExport).length, cases.length),
    distinctSilhouettes: silhouettes,
    editHistoryCorrect,
    externalWorldEditVerified: options.externalWorldEditVerified ?? false
  };
  const automatedReady = cases.every((item) => item.passed) && silhouettes >= 4 && editHistoryCorrect;
  return { cases, automatedReady, releaseReady: automatedReady && metrics.externalWorldEditVerified, schematicEngine: useMcschematic ? "mcschematic" : "builtin", metrics };
}
