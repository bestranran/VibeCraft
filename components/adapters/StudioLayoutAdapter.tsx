"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BuildingDetailsPanel, type BuildingMaterial, type BuildingRecentEdit } from "@/components/redesign/BuildingDetailsPanel";
import { LeftStudioPanel, type StudioInspiration } from "@/components/redesign/LeftStudioPanel";
import { StudioLayout } from "@/components/redesign/StudioLayout";
import { StudioToolbar } from "@/components/redesign/StudioToolbar";
import { VoxelCanvas } from "@/components/VoxelCanvas";
import { useI18n } from "@/i18n/LocaleProvider";
import { getBlockColor } from "@/lib/structure";
import { analyzeStructureQuality } from "@/lib/structure-analysis";
import type { BuildingDocument } from "@/lib/structure";

export type StudioLayoutAdapterProps = {
  document: BuildingDocument;
  title: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  generateLoading: boolean;
  generateError?: string | null;
  generateInfo?: string | null;
  onPlanDistrict: () => void;
  planLoading: boolean;
  planError?: string | null;
  editPrompt: string;
  onEditPromptChange: (value: string) => void;
  onPreviewEdit: () => void;
  editLoading: boolean;
  editError?: string | null;
  onAcceptEdit: () => void;
  onRejectEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportSchematic: () => void;
  onExportFunction: () => void;
  exportLoading: boolean;
  exportError?: string | null;
  onClear: () => void;
  onOpenSettings: () => void;
  persistenceNotice?: { kind: "info" | "error"; message: string; requiresReset?: boolean } | null;
  onDismissPersistenceNotice: () => void;
  overlay?: ReactNode;
};

export function StudioLayoutAdapter({
  document,
  title,
  prompt,
  onPromptChange,
  onGenerate,
  generateLoading,
  generateError,
  generateInfo,
  onPlanDistrict,
  planLoading,
  planError,
  editPrompt,
  onEditPromptChange,
  onPreviewEdit,
  editLoading,
  editError,
  onAcceptEdit,
  onRejectEdit,
  onUndo,
  onRedo,
  onExportSchematic,
  onExportFunction,
  exportLoading,
  exportError,
  onClear,
  onOpenSettings,
  persistenceNotice,
  onDismissPersistenceNotice,
  overlay,
}: StudioLayoutAdapterProps) {
  const { locale, t, plural, number, time, block } = useI18n();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const structure = document.structure;
  const isGenerated = structure.blocks.length > 0;
  const quality = useMemo(() => analyzeStructureQuality(structure), [structure]);
  const materials = useMemo<BuildingMaterial[]>(() => {
    const counts = new Map<string, number>();
    for (const item of structure.blocks) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    const total = Math.max(1, structure.blocks.length);
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id, count]) => ({
        id,
        name: block(id),
        sub: id.replace(/^minecraft:/, "").replaceAll("_", " "),
        color: getBlockColor(id as Parameters<typeof getBlockColor>[0]),
        percentage: Math.max(1, Math.round((count / total) * 100)),
      }));
  }, [block, structure.blocks]);
  const recentEdits = useMemo<BuildingRecentEdit[]>(() => document.history.slice(-3).reverse().map((edit) => ({
    id: edit.id,
    text: edit.prompt,
    time: time(edit.createdAt, { hour: "2-digit", minute: "2-digit" }),
  })), [document.history, time]);

  const isChinese = locale === "zh-CN";
  const inspirations: StudioInspiration[] = isChinese
    ? [
        { label: "现代玻璃摩天大楼", icon: "🏙", prompt: "现代玻璃摩天大楼" },
        { label: "古典中式四合院", icon: "🏯", prompt: "古典中式四合院" },
        { label: "海盗船坞要塞", icon: "⚓", prompt: "海盗船坞要塞" },
      ]
    : [
        { label: "Modern glass skyscraper", icon: "🏙", prompt: "Modern glass skyscraper" },
        { label: "Classical Chinese courtyard", icon: "🏯", prompt: "Classical Chinese courtyard" },
        { label: "Pirate dock fortress", icon: "⚓", prompt: "Pirate dock fortress" },
      ];
  const recentRefinements = document.history.slice(-3).reverse().map((edit) => edit.prompt);

  const leftPanel = (
    <LeftStudioPanel
      prompt={prompt}
      onPromptChange={onPromptChange}
      onGenerate={onGenerate}
      isGenerating={generateLoading}
      isGenerated={isGenerated}
      generateError={generateError}
      generateInfo={generateInfo}
      inspirations={inspirations}
      onUseInspiration={(inspiration) => onPromptChange(inspiration.prompt)}
      onPlanDistrict={onPlanDistrict}
      isPlanningDistrict={planLoading}
      planError={planError}
      refinePrompt={editPrompt}
      onRefinePromptChange={onEditPromptChange}
      onRefine={onPreviewEdit}
      isRefining={editLoading}
      refineError={editError}
      hasPendingRefinement={Boolean(document.pendingEdit)}
      onAcceptRefinement={onAcceptEdit}
      onRejectRefinement={onRejectEdit}
      recentRefinements={recentRefinements}
      collapsed={leftCollapsed}
      onToggleCollapse={() => setLeftCollapsed((current) => !current)}
      text={isChinese ? {
        collapse: "收起面板", expand: "展开面板", title: "创作工作室", describeBadge: "描述", describeHint: "用自然语言描述您的建筑",
        promptPlaceholder: "(｡•̀ᴗ-)✧", inspiration: "灵感参考",
        planDistrict: "规划 128×128 城区", planningDistrict: "正在规划城区…", generate: "生成建筑", regenerate: "重新生成", generating: "正在生成…",
        refine: "精炼", refinePlaceholder: "继续描述您希望调整的细节…", recentRefinements: "最近调整", preview: "预览修改", previewing: "正在规划…", accept: "接受", reject: "拒绝",
      } : {
        collapse: "Collapse panel", expand: "Expand panel", title: "Creation Studio", describeBadge: "Describe", describeHint: "Describe your build in natural language",
        promptPlaceholder: "(｡•̀ᴗ-)✧", inspiration: "Inspiration",
        planDistrict: "Plan 128×128 district", planningDistrict: "Planning district…", generate: "Generate building", regenerate: "Regenerate", generating: "Generating…",
        refine: "Refine", refinePlaceholder: "Describe the details you want to adjust…", recentRefinements: "Recent refinements", preview: "Preview edit", previewing: "Planning…", accept: "Accept", reject: "Reject",
      }}
    />
  );

  const rightPanel = (
    <BuildingDetailsPanel
      isGenerated={isGenerated}
      collapsed={rightCollapsed}
      onToggleCollapse={() => setRightCollapsed((current) => !current)}
      dimensions={[number(structure.size[0]), number(structure.size[1]), number(structure.size[2])]}
      blockCount={number(structure.blocks.length)}
      qualityScore={quality.score}
      qualityLabel={isChinese ? qualityLabelZh(quality.score) : qualityLabelEn(quality.score)}
      materials={materials}
      recentEdits={recentEdits}
      onExportSchematic={onExportSchematic}
      onExportFunction={onExportFunction}
      exportLoading={exportLoading}
      exportError={exportError}
      onClear={onClear}
      text={isChinese ? {
        collapse: "收起面板", expand: "展开面板", title: "建筑详情", empty: "生成建筑后，将在此处显示详细信息", dimensions: "尺寸", width: "宽", height: "高", depth: "深", unit: "格",
        blockCount: "方块总数", quality: "结构质量", materials: "主要材料", showAllMaterials: "查看全部材料", hideMaterials: "收起材料", recentEdits: "近期操作", noEdits: "暂无已接受的调整",
        export: "导出建筑", exporting: "正在导出…", exportSchematic: "WorldEdit 原理图", exportFunction: "Minecraft 函数", clear: "清除当前建筑",
      } : {
        collapse: "Collapse panel", expand: "Expand panel", title: "Building Details", empty: "Building details will appear here after generation", dimensions: "Dimensions", width: "W", height: "H", depth: "D", unit: "blocks",
        blockCount: "Total blocks", quality: "Structure quality", materials: "Main materials", showAllMaterials: "Show all materials", hideMaterials: "Hide materials", recentEdits: "Recent activity", noEdits: "No accepted refinements yet",
        export: "Export building", exporting: "Exporting…", exportSchematic: "WorldEdit schematic", exportFunction: "Minecraft function", clear: "Clear current building",
      }}
    />
  );

  const nextLocale = locale === "zh-CN" ? "en" : "zh-CN";
  const nextLanguageLabel = nextLocale === "en" ? t("language.en") : t("language.zhCN");
  const toolbar = (
    <StudioToolbar
      languageHref={`/${nextLocale}`}
      languageLabel={locale === "zh-CN" ? "中文" : "EN"}
      languageTitle={`${t("language.label")}: ${nextLanguageLabel}`}
      onOpenSettings={onOpenSettings}
      onUndo={onUndo}
      undoDisabled={Boolean(document.pendingEdit) || document.history.length === 0}
      onRedo={onRedo}
      redoDisabled={Boolean(document.pendingEdit) || document.future.length === 0}
      onDownload={onExportSchematic}
      downloadDisabled={!isGenerated || exportLoading}
      onClear={onClear}
      clearDisabled={!isGenerated}
      text={{
        keyboard: isChinese ? "快捷键：Ctrl / ⌘ + Enter 预览修改" : "Shortcut: Ctrl / ⌘ + Enter to preview",
        settings: t("canvas.aiSettings"),
        light: isChinese ? "浅色" : "Light",
        system: isChinese ? "跟随系统" : "System",
        dark: isChinese ? "深色" : "Dark",
        undo: t("canvas.undo"),
        redo: t("canvas.redo"),
        download: t("canvas.exportSchematic"),
        clear: t("canvas.clearScene"),
      }}
    />
  );

  return (
    <StudioLayout
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      toolbar={toolbar}
      canvas={<VoxelCanvas structure={structure} pendingEdit={document.pendingEdit} />}
      leftCollapsed={leftCollapsed}
      rightCollapsed={rightCollapsed}
      projectTitle={title}
      isGenerated={isGenerated}
      isGenerating={generateLoading}
      generatingLabel={t("prompt.generating")}
      emptyTitle={isChinese ? "描述您的建筑想法" : "Describe your building idea"}
      emptyDescription={isChinese ? "在左侧输入描述，点击生成开始创作" : "Describe it on the left, then generate to begin"}
      notice={persistenceNotice ? {
        kind: persistenceNotice.kind,
        message: persistenceNotice.message,
        ...(persistenceNotice.requiresReset
          ? { actionLabel: t("notice.discardSaved"), onAction: onClear }
          : { onDismiss: onDismissPersistenceNotice }),
      } : null}
      pendingEdit={document.pendingEdit ? {
        prompt: document.pendingEdit.prompt,
        changeLabel: plural("edit.changes", document.pendingEdit.patch.changes.length),
        acceptLabel: t("edit.accept"),
        rejectLabel: t("edit.reject"),
        onAccept: onAcceptEdit,
        onReject: onRejectEdit,
      } : null}
      overlay={overlay}
    />
  );
}

function qualityLabelZh(score: number) {
  if (score >= 90) return "优秀";
  if (score >= 75) return "良好";
  if (score >= 60) return "可用";
  return "需检查";
}

function qualityLabelEn(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Review";
}
