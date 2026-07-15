"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Check, Download, Eraser, KeyRound, Redo2, Undo2, X } from "lucide-react";
import { ApiKeyDialog } from "@/components/ApiKeyDialog";
import { InspectorPanel } from "@/components/InspectorPanel";
import { PromptPanel } from "@/components/PromptPanel";
import { VoxelCanvas } from "@/components/VoxelCanvas";
import { WorldPlanPreview } from "@/components/WorldPlanPreview";
import { exportMcFunction, toMcFunctionFilename, toSchematicFilename } from "@/lib/exporters";
import { EXAMPLE_PROMPTS } from "@/lib/structure";
import type { GenerationMetadata, VoxelStructure, WorldPlan, WorldPlanMetadata } from "@/lib/structure";
import type { BuildingDocument } from "@/lib/structure";
import { generateStructure } from "@/lib/generator";
import { applyBuildingOperations } from "@/lib/building-operations";
import { summarizeStructure } from "@/lib/structure-analysis";
import { acceptPendingEdit, createBuildingDocument, redoDocument, rejectPendingEdit, setPendingEdit, setWorldPlan, undoDocument } from "@/lib/building-document";

export function StudioShell() {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0]);
  const [document, setDocument] = useState<BuildingDocument>(() => createBuildingDocument(generateStructure(EXAMPLE_PROMPTS[0])));
  const [editPrompt, setEditPrompt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [plannerLabel, setPlannerLabel] = useState("AI planner");
  const [deepSeekKey, setDeepSeekKey] = useState("");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planPreviewOpen, setPlanPreviewOpen] = useState(false);
  const structure = document.structure;

  const hasBlocks = structure.blocks.length > 0;
  const title = useMemo(() => structure.name.replaceAll("-", " "), [structure.name]);

  useEffect(() => {
    const savedKey = window.sessionStorage.getItem("vibecraft.deepseekApiKey") || "";
    setDeepSeekKey(savedKey);
    setPlannerLabel(savedKey ? "DeepSeek AI" : "Local planner");
    if (!window.sessionStorage.getItem("vibecraft.deepseekPromptSeen")) {
      window.sessionStorage.setItem("vibecraft.deepseekPromptSeen", "true");
      setKeyDialogOpen(true);
    }
  }, []);

  function saveDeepSeekKey(apiKey: string) {
    if (apiKey) window.sessionStorage.setItem("vibecraft.deepseekApiKey", apiKey);
    else window.sessionStorage.removeItem("vibecraft.deepseekApiKey");
    setDeepSeekKey(apiKey);
    setPlannerLabel(apiKey ? "DeepSeek AI" : "Local planner");
    setKeyDialogOpen(false);
  }

  async function handlePlanDistrict(seed?: number) {
    const command = prompt.trim();
    if (!command || planLoading) return;
    setPlanLoading(true);
    setPlanError(null);
    try {
      const response = await fetch("/api/world/plan", { method: "POST", headers: { "Content-Type": "application/json", ...(deepSeekKey ? { "X-DeepSeek-API-Key": deepSeekKey } : {}) }, body: JSON.stringify({ prompt: command, ...(seed === undefined ? {} : { seed }) }) });
      const payload = await response.json() as { plan?: WorldPlan; metadata?: WorldPlanMetadata; provider?: string; fallback?: boolean; error?: string };
      if (!response.ok || !payload.plan || !payload.metadata) throw new Error(payload.error || "The planner returned no world plan.");
      setDocument((current) => setWorldPlan(current, payload.plan!, payload.metadata!));
      setPlannerLabel(payload.metadata.provider === "deepseek" ? "DeepSeek AI" : "Local planner");
      setPlanPreviewOpen(true);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "This district could not be planned.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleGenerate(nextPrompt = prompt) {
    const command = nextPrompt.trim();
    if (!command || generateLoading) return;
    setPrompt(command);
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateInfo(null);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", ...(deepSeekKey ? { "X-DeepSeek-API-Key": deepSeekKey } : {}) }, body: JSON.stringify({ prompt: command }) });
      const payload = await response.json() as {
        structure?: VoxelStructure;
        provider?: string;
        fallback?: boolean;
        error?: string;
        repaired?: boolean;
        stats?: { operationCount?: number; toolCallCount?: number; blockCount?: number };
        validation?: { diagnostics?: Array<{ severity?: "error" | "warning" }> };
        generationMetadata?: GenerationMetadata;
      };
      if (!response.ok || !payload.structure) throw new Error(payload.error || "The generator returned no structure.");
      setDocument(createBuildingDocument(payload.structure, payload.generationMetadata ? { generationMetadata: payload.generationMetadata } : undefined));
      const isDeepSeek = payload.provider === "deepseek-buildscript";
      const warningCount = payload.validation?.diagnostics?.filter((diagnostic) => diagnostic.severity === "warning").length ?? 0;
      setPlannerLabel(isDeepSeek ? "DeepSeek BuildScript" : "Local fallback");
      setGenerateInfo(isDeepSeek
        ? `${payload.stats?.operationCount ?? 0} operations · ${payload.structure.blocks.length.toLocaleString()} blocks · validated${payload.repaired ? " · repaired once" : ""}${warningCount ? ` · ${warningCount} warnings` : ""}`
        : "Generated with the offline local fallback.");
      setEditPrompt("");
      setEditError(null);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "This building could not be generated.");
    } finally {
      setGenerateLoading(false);
    }
  }

  function handleClear() {
    setDocument(createBuildingDocument({ name: "empty-scene", size: [0, 0, 0], blocks: [] }));
    setEditPrompt("");
    setEditError(null);
  }

  async function handlePreviewEdit() {
    if (!editPrompt.trim() || document.pendingEdit) return;
    try {
      setEditLoading(true);
      setEditError(null);
      const response = await fetch("/api/edit", { method: "POST", headers: { "Content-Type": "application/json", ...(deepSeekKey ? { "X-DeepSeek-API-Key": deepSeekKey } : {}) }, body: JSON.stringify({ command: editPrompt, structureSummary: summarizeStructure(structure), availableOperations: ["resizeRoof", "addWindows", "addChimney", "addPath", "changePalette", "addFloor", "removeFeature"], structure }) });
      const payload = await response.json() as { operations?: import("@/lib/structure").BuildingOperation[]; provider?: string; fallback?: boolean; error?: string };
      if (!response.ok || !payload.operations) throw new Error(payload.error || "The planner returned no operations.");
      setPlannerLabel(payload.provider === "deepseek" ? "DeepSeek AI" : payload.fallback ? "Local fallback" : "Local planner");
      const operations = payload.operations;
      const result = applyBuildingOperations(structure, operations);
      setDocument((current) => setPendingEdit(current, { prompt: editPrompt.trim(), operations, patch: result.patch, preview: result.structure }));
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "This edit could not be previewed.");
    } finally {
      setEditLoading(false);
    }
  }

  function handleAcceptEdit() {
    setDocument((current) => acceptPendingEdit(current));
    setEditPrompt("");
    setEditError(null);
  }

  function handleRejectEdit() {
    setDocument((current) => rejectPendingEdit(current));
    setEditError(null);
  }

  function handleUndo() {
    setDocument((current) => undoDocument(current));
  }

  function handleRedo() {
    setDocument((current) => redoDocument(current));
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleMcFunctionExport() {
    if (!hasBlocks) return;
    const blob = new Blob([exportMcFunction(structure)], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, toMcFunctionFilename(structure.name));
  }

  async function handleSchematicExport() {
    if (!hasBlocks || exportLoading) return;
    setExportLoading(true);
    setExportError(null);
    try {
      const response = await fetch("/api/export/schem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structure, minecraftVersion: "1.20.1" })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "WorldEdit schematic export failed.");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? toSchematicFilename(structure.name);
      downloadBlob(await response.blob(), filename);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "WorldEdit schematic export failed.");
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-coal text-stone-100">
      <div className="grid min-h-screen grid-cols-1 grid-rows-[auto_1fr_auto] lg:grid-cols-[320px_minmax(0,1fr)_300px] lg:grid-rows-1">
        <PromptPanel prompt={prompt} onPromptChange={(value) => { setPrompt(value); setPlanPreviewOpen(false); }} onGenerate={handleGenerate} generateLoading={generateLoading} generateError={generateError} generateInfo={generateInfo} planLoading={planLoading} planError={planError} editPrompt={editPrompt} pendingEdit={document.pendingEdit} editError={editError} editDisabled={!hasBlocks} editLoading={editLoading} plannerLabel={plannerLabel} onEditPromptChange={setEditPrompt} onPlanDistrict={() => handlePlanDistrict()} onPreviewEdit={handlePreviewEdit} onAcceptEdit={handleAcceptEdit} onRejectEdit={handleRejectEdit} />

        <section className="relative min-h-[52vh] border-y border-line bg-[#1d1d1a] lg:min-h-screen lg:border-x lg:border-y-0">
          <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded border border-line bg-coal/80 px-3 py-2 shadow-tool backdrop-blur">
            <Box className="h-4 w-4 text-sand" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold capitalize text-stone-100">{title}</p>
              <p className="text-xs text-stone-400">{structure.blocks.length} blocks in scene</p>
            </div>
          </div>

          <div className="absolute right-3 top-3 z-10 flex gap-2">
            <button type="button" onClick={() => setKeyDialogOpen(true)} title="DeepSeek settings" className={`inline-flex h-9 w-9 items-center justify-center rounded border bg-panel transition hover:bg-panelSoft ${deepSeekKey ? "border-[#8a7140] text-sand" : "border-line text-stone-400"}`}><KeyRound className="h-4 w-4" /><span className="sr-only">DeepSeek settings</span></button>
            <ToolButton label="Undo" onClick={handleUndo} disabled={Boolean(document.pendingEdit) || !document.history.length}><Undo2 className="h-4 w-4" /></ToolButton>
            <ToolButton label="Redo" onClick={handleRedo} disabled={Boolean(document.pendingEdit) || !document.future.length}><Redo2 className="h-4 w-4" /></ToolButton>
            <button
              type="button"
              onClick={handleSchematicExport}
              disabled={!hasBlocks || exportLoading}
              title="Export WorldEdit schematic"
              className="inline-flex h-9 w-9 items-center justify-center rounded border border-line bg-panel text-stone-100 transition hover:bg-panelSoft disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" aria-hidden />
              <span className="sr-only">Export</span>
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Clear scene"
              className="inline-flex h-9 w-9 items-center justify-center rounded border border-line bg-panel text-stone-100 transition hover:bg-panelSoft"
            >
              <Eraser className="h-4 w-4" aria-hidden />
              <span className="sr-only">Clear</span>
            </button>
          </div>

          <VoxelCanvas structure={structure} pendingEdit={document.pendingEdit} />

          {planPreviewOpen && document.worldPlan && <WorldPlanPreview plan={document.worldPlan} metadata={document.worldPlanMetadata} loading={planLoading} onRegenerate={() => handlePlanDistrict(((document.worldPlanMetadata?.seed ?? 0) + 1) >>> 0)} onClose={() => setPlanPreviewOpen(false)} />}

          {document.pendingEdit && (
            <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded border border-line bg-coal/90 p-2 shadow-tool backdrop-blur">
              <span className="hidden max-w-[260px] truncate px-1 text-xs text-stone-300 sm:block">{document.pendingEdit.prompt}</span>
              <span className="whitespace-nowrap text-xs text-[#70d3aa]">{document.pendingEdit.patch.changes.length} changes</span>
              <button type="button" onClick={handleAcceptEdit} className="inline-flex h-8 items-center gap-1 rounded border border-[#458769] bg-[#315f4a] px-2 text-xs font-semibold"><Check className="h-3.5 w-3.5" />Accept</button>
              <button type="button" onClick={handleRejectEdit} className="inline-flex h-8 items-center gap-1 rounded border border-[#92524a] bg-[#5f3631] px-2 text-xs font-semibold"><X className="h-3.5 w-3.5" />Reject</button>
            </div>
          )}
        </section>

        <InspectorPanel structure={structure} history={document.history} futureCount={document.future.length} onExportSchem={handleSchematicExport} onExportMcFunction={handleMcFunctionExport} exportLoading={exportLoading} exportError={exportError} onClear={handleClear} />
      </div>
      <ApiKeyDialog open={keyDialogOpen} initialValue={deepSeekKey} onSave={saveDeepSeekKey} onClose={() => setKeyDialogOpen(false)} />
    </main>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={label} className="inline-flex h-9 w-9 items-center justify-center rounded border border-line bg-panel text-stone-100 transition hover:bg-panelSoft disabled:cursor-not-allowed disabled:opacity-35">{children}<span className="sr-only">{label}</span></button>;
}
