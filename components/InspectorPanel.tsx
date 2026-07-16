"use client";

import { Download, Eraser } from "lucide-react";
import { getBlockColor, getUsedBlockTypes } from "@/lib/structure";
import type { VoxelStructure } from "@/lib/structure";
import type { EditTransaction } from "@/lib/structure";
import { analyzeStructureQuality } from "@/lib/structure-analysis";
import { useI18n } from "@/i18n/LocaleProvider";

type InspectorPanelProps = {
  structure: VoxelStructure;
  onExportSchem: () => void;
  onExportMcFunction: () => void;
  exportLoading?: boolean;
  exportError?: string | null;
  onClear: () => void;
  history: EditTransaction[];
  futureCount: number;
};

export function InspectorPanel({ structure, history, futureCount, onExportSchem, onExportMcFunction, exportLoading = false, exportError, onClear }: InspectorPanelProps) {
  const { t, plural, number, date, time, block } = useI18n();
  const usedBlocks = getUsedBlockTypes(structure);
  const hasBlocks = structure.blocks.length > 0;
  const quality = analyzeStructureQuality(structure);

  return (
    <aside className="flex flex-col gap-4 bg-panel p-4 lg:min-h-screen">
      <div className="border-b border-line pb-3">
        <h2 className="text-sm font-semibold">{t("inspector.title")}</h2>
        <p className="mt-1 text-xs text-stone-400">{t("inspector.description")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label={t("inspector.width")} value={number(structure.size[0])} />
        <Metric label={t("inspector.height")} value={number(structure.size[1])} />
        <Metric label={t("inspector.depth")} value={number(structure.size[2])} />
      </div>

      <div className="rounded border border-line bg-coal p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("inspector.blockCount")}</p>
        <p className="mt-1 text-2xl font-semibold">{number(structure.blocks.length)}</p>
      </div>

      <div className="rounded border border-line bg-coal p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("inspector.quality")}</p>
          <p className={`text-sm font-semibold ${quality.score >= 90 ? "text-[#70d3aa]" : "text-sand"}`}>{number(quality.score)}/100</p>
        </div>
        <p className="mt-1 text-[11px] text-stone-500">{t("inspector.isolated", { count: number(quality.metrics.isolatedBlocks) })} · {t("inspector.duplicates", { count: number(quality.metrics.duplicateCoordinates) })}</p>
        {localizedQualityWarnings(quality.metrics, structure.blocks.length, plural, t).slice(0, 2).map((warning) => <p key={warning} className="mt-2 text-xs leading-4 text-[#e5b17a]">{warning}</p>)}
      </div>

      <section className="min-h-0 flex-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{t("inspector.palette")}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {usedBlocks.length === 0 ? (
            <p className="rounded border border-line bg-coal p-3 text-sm text-stone-400">{t("inspector.noBlocks")}</p>
          ) : (
            usedBlocks.map((id) => (
              <div key={id} className="flex items-center gap-3 rounded border border-line bg-coal px-3 py-2">
                <span
                  className="h-5 w-5 shrink-0 rounded-sm border border-black/40"
                  style={{ backgroundColor: getBlockColor(id) }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="break-words text-sm text-stone-100">{block(id)}</p>
                  <p className="truncate text-xs text-stone-500">{id}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="border-t border-line pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("inspector.recentEdits")}</p>
          {futureCount > 0 && <span className="text-right text-[11px] text-stone-500">{plural("inspector.redo", futureCount)}</span>}
        </div>
        <div className="space-y-1.5">
          {history.length === 0 ? <p className="text-xs text-stone-500">{t("inspector.noEdits")}</p> : history.slice(-3).reverse().map((item) => (
            <div key={item.id} className="rounded border border-line bg-coal px-2.5 py-2">
              <p className="truncate text-xs text-stone-200">{item.prompt}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-stone-500">{plural("inspector.blockChanges", item.patch.changes.length)} · {t("inspector.editedAt", { date: date(item.createdAt), time: time(item.createdAt) })}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
        <details className="group relative">
          <summary className={`inline-flex h-10 w-full list-none items-center justify-center gap-2 rounded border border-[#8a7140] bg-sand px-3 text-sm font-semibold text-[#252016] transition hover:bg-[#dfc17b] [&::-webkit-details-marker]:hidden ${!hasBlocks || exportLoading ? "pointer-events-none opacity-40" : "cursor-pointer"}`}>
            <Download className="h-4 w-4" aria-hidden />
            {exportLoading ? t("export.exporting") : t("export.action")}
          </summary>
          <div className="absolute bottom-12 left-0 z-20 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded border border-line bg-coal p-1 shadow-tool">
            <button type="button" onClick={onExportSchem} className="w-full rounded px-3 py-2 text-left text-xs text-stone-100 hover:bg-panelSoft">
              <span className="block font-semibold">{t("export.schematic")}</span>
              <span className="text-stone-500">.schem · Java 1.20.1</span>
            </button>
            <button type="button" onClick={onExportMcFunction} className="w-full rounded px-3 py-2 text-left text-xs text-stone-100 hover:bg-panelSoft">
              <span className="block font-semibold">{t("export.function")}</span>
              <span className="text-stone-500">.mcfunction</span>
            </button>
          </div>
        </details>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-10 items-center justify-center gap-2 rounded border border-line bg-coal px-3 text-sm font-semibold text-stone-100 transition hover:bg-panelSoft"
        >
          <Eraser className="h-4 w-4" aria-hidden />
          {t("export.clear")}
        </button>
      </div>
      {exportError && <p role="alert" className="-mt-2 text-xs leading-5 text-[#ef9a8f]">{exportError}</p>}
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-coal p-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function localizedQualityWarnings(
  metrics: { isolatedBlocks: number; duplicateCoordinates: number },
  blockCount: number,
  plural: (key: string, count: number) => string,
  t: (key: "inspector.emptyWarning" | "inspector.limitWarning") => string
) {
  const warnings: string[] = [];
  if (!blockCount) warnings.push(t("inspector.emptyWarning"));
  if (metrics.duplicateCoordinates) warnings.push(plural("inspector.duplicateWarning", metrics.duplicateCoordinates));
  if (metrics.isolatedBlocks) warnings.push(plural("inspector.isolatedWarning", metrics.isolatedBlocks));
  if (blockCount > 12000) warnings.push(t("inspector.limitWarning"));
  return warnings;
}
