"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiKeyDialog } from "@/components/ApiKeyDialog";
import { WorldPlanPreview } from "@/components/WorldPlanPreview";
import { StudioLayoutAdapter } from "@/components/adapters/StudioLayoutAdapter";
import { exportMcFunction, toMcFunctionFilename, toSchematicFilename } from "@/lib/exporters";
import { EXAMPLE_PROMPTS } from "@/lib/structure";
import type { BuildingOperation, GenerationMetadata, StructurePatch, VoxelStructure, VoxelToolCall, WorldPlan, WorldPlanMetadata } from "@/lib/structure";
import type { BuildingDocument } from "@/lib/structure";
import { generateStructure, placeStructureInScene } from "@/lib/generator";
import { acceptPendingEdit, createBuildingDocument, redoDocument, rejectPendingEdit, setPendingEdit, setWorldPlan, undoDocument } from "@/lib/building-document";
import { clearSavedProject, loadProject, saveProject } from "@/lib/project-persistence";
import { useI18n } from "@/i18n/LocaleProvider";
import type { AiApiMode, AiProvider } from "@/lib/ai-provider";

type PersistenceNotice = { kind: "info" | "error"; message: string; requiresReset?: boolean };

export function StudioShell() {
  const { locale, t, plural, number, identifier, error: localizeError } = useI18n();
  const [prompt, setPrompt] = useState(() => t("example.cyberpunk"));
  const [document, setDocument] = useState<BuildingDocument>(() => createBuildingDocument(placeStructureInScene(generateStructure(EXAMPLE_PROMPTS[0]))));
  const [editPrompt, setEditPrompt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [plannerLabel, setPlannerLabel] = useState(() => t("edit.aiPlanner"));
  const [aiProvider, setAiProvider] = useState<AiProvider>("deepseek");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiMode, setAiApiMode] = useState<AiApiMode>("anthropic");
  const [aiModel, setAiModel] = useState("claude-opus-4-8");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planPreviewOpen, setPlanPreviewOpen] = useState(false);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [persistenceNotice, setPersistenceNotice] = useState<PersistenceNotice | null>(null);
  const editRequestId = useRef(0);
  const structure = document.structure;

  const hasBlocks = structure.blocks.length > 0;
  const title = useMemo(() => identifier(structure.name), [identifier, structure.name]);

  function canonicalPrompt(value: string) {
    const localizedExamples = [t("example.cyberpunk"), t("example.medieval"), t("example.japanese")];
    const index = localizedExamples.indexOf(value);
    return index >= 0 ? EXAMPLE_PROMPTS[index] : value;
  }

  function aiHeaders(): Record<string, string> {
    if (!aiApiKey) return {};
    return {
      "X-AI-Provider": aiProvider,
      "X-AI-API-Key": aiApiKey,
      ...(aiProvider === "claude" ? {
        "X-AI-Model": aiModel || "claude-opus-4-8",
        ...(aiBaseUrl ? { "X-AI-Base-URL": aiBaseUrl, "X-AI-API-Mode": aiApiMode } : {})
      } : {})
    };
  }

  useEffect(() => {
    const legacyKey = window.sessionStorage.getItem("vibecraft.deepseekApiKey") || "";
    const savedProvider = window.sessionStorage.getItem("vibecraft.aiProvider") === "claude" ? "claude" : "deepseek";
    const savedKey = window.sessionStorage.getItem("vibecraft.aiApiKey") || legacyKey;
    const savedBaseUrl = window.sessionStorage.getItem("vibecraft.aiBaseUrl") || "";
    const savedApiMode = window.sessionStorage.getItem("vibecraft.aiApiMode") === "openai-compatible" ? "openai-compatible" : "anthropic";
    const savedModel = window.sessionStorage.getItem("vibecraft.aiModel") || "claude-opus-4-8";
    setAiProvider(savedProvider);
    setAiApiKey(savedKey);
    setAiBaseUrl(savedBaseUrl);
    setAiApiMode(savedApiMode);
    setAiModel(savedModel);
    setPlannerLabel(savedKey ? t(aiLabelKey(savedProvider)) : t("edit.localPlanner"));
    if (!window.sessionStorage.getItem("vibecraft.aiPromptSeen") && !window.sessionStorage.getItem("vibecraft.deepseekPromptSeen")) {
      window.sessionStorage.setItem("vibecraft.aiPromptSeen", "true");
      setKeyDialogOpen(true);
    }
  }, [t]);

  useEffect(() => {
    const result = loadProject(window.localStorage);
    if (result.status === "restored") {
      setDocument(result.document);
      if (result.document.generationMetadata?.prompt) {
        const restoredPrompt = result.document.generationMetadata.prompt;
        const exampleIndex = EXAMPLE_PROMPTS.indexOf(restoredPrompt);
        const exampleKeys = ["example.cyberpunk", "example.medieval", "example.japanese"] as const;
        setPrompt(exampleIndex >= 0 ? t(exampleKeys[exampleIndex]) : restoredPrompt);
      }
      if (result.pendingEditDiscarded) {
        setPersistenceNotice({ kind: "info", message: t("notice.restoredDiscarded") });
      }
      setPersistenceReady(true);
      return;
    }
    if (result.status === "invalid") {
      setPersistenceNotice({ kind: "error", message: localizeError(result.message, "errors.storageFailed"), requiresReset: true });
      return;
    }
    setPersistenceReady(true);
  }, [localizeError, t]);

  useEffect(() => {
    if (!persistenceReady) return;
    try {
      saveProject(window.localStorage, document);
    } catch (error) {
      setPersistenceReady(false);
      setPersistenceNotice({
        kind: "error",
        message: localizeError(error instanceof Error ? error.message : undefined, "errors.saveFailed"),
        requiresReset: true
      });
    }
  }, [document, localizeError, persistenceReady]);

  function saveAiConnection(provider: AiProvider, apiKey: string, baseUrl: string, apiMode: AiApiMode, model: string) {
    window.sessionStorage.setItem("vibecraft.aiProvider", provider);
    window.sessionStorage.removeItem("vibecraft.deepseekApiKey");
    if (apiKey) window.sessionStorage.setItem("vibecraft.aiApiKey", apiKey);
    else window.sessionStorage.removeItem("vibecraft.aiApiKey");
    if (provider === "claude" && baseUrl) window.sessionStorage.setItem("vibecraft.aiBaseUrl", baseUrl);
    else window.sessionStorage.removeItem("vibecraft.aiBaseUrl");
    window.sessionStorage.setItem("vibecraft.aiApiMode", apiMode);
    if (provider === "claude" && model) window.sessionStorage.setItem("vibecraft.aiModel", model);
    else window.sessionStorage.removeItem("vibecraft.aiModel");
    setAiProvider(provider);
    setAiApiKey(apiKey);
    setAiBaseUrl(provider === "claude" ? baseUrl : "");
    setAiApiMode(apiMode);
    setAiModel(provider === "claude" && model ? model : "claude-opus-4-8");
    setPlannerLabel(apiKey ? t(aiLabelKey(provider)) : t("edit.localPlanner"));
    setKeyDialogOpen(false);
  }

  async function handlePlanDistrict(seed?: number) {
    const visibleCommand = prompt.trim();
    if (!visibleCommand || planLoading) return;
    const command = canonicalPrompt(visibleCommand);
    setPlanLoading(true);
    setPlanError(null);
    try {
      const response = await fetch("/api/world/plan", { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": locale, ...aiHeaders() }, body: JSON.stringify({ prompt: command, ...(seed === undefined ? {} : { seed }) }) });
      const payload = await response.json() as { plan?: WorldPlan; metadata?: WorldPlanMetadata; provider?: string; fallback?: boolean; error?: string };
      if (!response.ok || !payload.plan || !payload.metadata) throw new Error(localizeError(payload.error, "errors.planMissing"));
      setDocument((current) => setWorldPlan(current, payload.plan!, payload.metadata!));
      setPlannerLabel(payload.metadata.provider === "claude" ? t("edit.claudeAi") : payload.metadata.provider === "deepseek" ? t("edit.deepSeekAi") : t("edit.localPlanner"));
      setPlanPreviewOpen(true);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : t("errors.planFailed"));
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleGenerate(nextPrompt = prompt, displayPrompt?: string) {
    const visibleCommand = nextPrompt.trim();
    if (!visibleCommand || generateLoading) return;
    const command = canonicalPrompt(visibleCommand);
    editRequestId.current += 1;
    setEditLoading(false);
    setPrompt(displayPrompt ?? visibleCommand);
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateInfo(null);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": locale, ...aiHeaders() }, body: JSON.stringify({ prompt: command }) });
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
      if (!response.ok || !payload.structure) throw new Error(localizeError(payload.error, "errors.structureMissing"));
      setDocument(createBuildingDocument(payload.structure, payload.generationMetadata ? { generationMetadata: payload.generationMetadata } : undefined));
      const isAi = payload.provider === "deepseek-buildscript" || payload.provider === "claude-buildscript";
      const warningCount = payload.validation?.diagnostics?.filter((diagnostic) => diagnostic.severity === "warning").length ?? 0;
      setPlannerLabel(payload.provider === "claude-buildscript" ? t("edit.claudeBuildScript") : payload.provider === "deepseek-buildscript" ? t("edit.deepSeekBuildScript") : t("edit.localFallback"));
      setGenerateInfo(isAi
        ? t("generation.summary", {
            operations: number(payload.stats?.operationCount ?? 0),
            blocks: number(payload.structure.blocks.length),
            repaired: payload.repaired ? t("generation.repaired") : "",
            warnings: warningCount ? t("generation.warnings", { count: number(warningCount) }) : ""
          })
        : t("generation.localFallback"));
      setEditPrompt("");
      setEditError(null);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : t("errors.generateFailed"));
    } finally {
      setGenerateLoading(false);
    }
  }

  function handleClear() {
    editRequestId.current += 1;
    setEditLoading(false);
    try {
      clearSavedProject(window.localStorage);
      setPersistenceReady(true);
      setPersistenceNotice(null);
    } catch (error) {
      setPersistenceReady(false);
      setPersistenceNotice({ kind: "error", message: localizeError(error instanceof Error ? error.message : undefined, "errors.clearFailed"), requiresReset: true });
    }
    setDocument(createBuildingDocument({ name: "empty-scene", size: [0, 0, 0], blocks: [] }));
    setEditPrompt("");
    setEditError(null);
  }

  async function handlePreviewEdit() {
    if (!editPrompt.trim() || document.pendingEdit) return;
    const requestId = editRequestId.current + 1;
    editRequestId.current = requestId;
    try {
      setEditLoading(true);
      setEditError(null);
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": locale, ...aiHeaders() },
        body: JSON.stringify({
          command: editPrompt,
          structure,
          generationMetadata: document.generationMetadata,
          semanticRegions: document.semanticRegions
        })
      });
      const payload = await response.json() as {
        operations?: BuildingOperation[];
        toolCalls?: VoxelToolCall[];
        patch?: StructurePatch;
        preview?: VoxelStructure;
        provider?: string;
        fallback?: boolean;
        limitedFallback?: boolean;
        repaired?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.patch || !payload.preview || (!payload.toolCalls && !payload.operations)) {
        throw new Error(localizeError(payload.error, "errors.previewMissing"));
      }
      if (editRequestId.current !== requestId) return;
      setPlannerLabel(payload.provider === "claude-voxel-edit"
        ? `${t("edit.claudeVoxelEditor")}${payload.repaired ? ` · ${t("edit.repaired")}` : ""}`
        : payload.provider === "deepseek-voxel-edit"
        ? `${t("edit.deepSeekVoxelEditor")}${payload.repaired ? ` · ${t("edit.repaired")}` : ""}`
        : payload.limitedFallback ? t("edit.limitedFallback") : t("edit.localPlanner"));
      setDocument((current) => setPendingEdit(current, {
        prompt: editPrompt.trim(),
        operations: payload.operations ?? [],
        ...(payload.toolCalls ? { toolCalls: payload.toolCalls } : {}),
        patch: payload.patch!,
        preview: payload.preview!
      }));
    } catch (error) {
      if (editRequestId.current === requestId) setEditError(error instanceof Error ? error.message : t("errors.previewFailed"));
    } finally {
      if (editRequestId.current === requestId) setEditLoading(false);
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
    editRequestId.current += 1;
    setEditLoading(false);
    setDocument((current) => undoDocument(current));
  }

  function handleRedo() {
    editRequestId.current += 1;
    setEditLoading(false);
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
        headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({ structure, minecraftVersion: "1.20.1" })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(localizeError(payload?.error, "errors.exportFailed"));
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? toSchematicFilename(structure.name);
      downloadBlob(await response.blob(), filename);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t("errors.exportFailed"));
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <>
      <StudioLayoutAdapter
        document={document}
        title={title}
        prompt={prompt}
        onPromptChange={(value) => { setPrompt(value); setPlanPreviewOpen(false); }}
        onGenerate={() => handleGenerate()}
        generateLoading={generateLoading}
        generateError={generateError}
        generateInfo={generateInfo}
        onPlanDistrict={() => handlePlanDistrict()}
        planLoading={planLoading}
        planError={planError}
        editPrompt={editPrompt}
        onEditPromptChange={setEditPrompt}
        onPreviewEdit={handlePreviewEdit}
        editLoading={editLoading}
        editError={editError}
        onAcceptEdit={handleAcceptEdit}
        onRejectEdit={handleRejectEdit}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportSchematic={handleSchematicExport}
        onExportFunction={handleMcFunctionExport}
        exportLoading={exportLoading}
        exportError={exportError}
        onClear={handleClear}
        onOpenSettings={() => setKeyDialogOpen(true)}
        persistenceNotice={persistenceNotice}
        onDismissPersistenceNotice={() => setPersistenceNotice(null)}
        overlay={planPreviewOpen && document.worldPlan ? (
          <WorldPlanPreview
            plan={document.worldPlan}
            metadata={document.worldPlanMetadata}
            loading={planLoading}
            onRegenerate={() => handlePlanDistrict(((document.worldPlanMetadata?.seed ?? 0) + 1) >>> 0)}
            onClose={() => setPlanPreviewOpen(false)}
          />
        ) : null}
      />
      <ApiKeyDialog open={keyDialogOpen} initialProvider={aiProvider} initialValue={aiApiKey} initialBaseUrl={aiBaseUrl} initialApiMode={aiApiMode} initialModel={aiModel} onSave={saveAiConnection} onClose={() => setKeyDialogOpen(false)} />
    </>
  );
}

function aiLabelKey(provider: AiProvider): "edit.deepSeekAi" | "edit.claudeAi" {
  return provider === "claude" ? "edit.claudeAi" : "edit.deepSeekAi";
}
