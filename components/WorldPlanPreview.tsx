"use client";

import { RotateCw, X } from "lucide-react";
import type { Box2D, WorldPlan, WorldPlanMetadata } from "@/lib/structure";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MessageKey } from "@/i18n/messages/en";

const LOT_COLORS = {
  residential: "#4f7668",
  commercial: "#796b45",
  industrial: "#76564f",
  utility: "#58647a"
} as const;

function boxStyle(bounds: Box2D) {
  return {
    left: `${(bounds.minX / 128) * 100}%`,
    top: `${(bounds.minZ / 128) * 100}%`,
    width: `${((bounds.maxX - bounds.minX + 1) / 128) * 100}%`,
    height: `${((bounds.maxZ - bounds.minZ + 1) / 128) * 100}%`
  };
}

function center(bounds: Box2D): [number, number] {
  return [(bounds.minX + bounds.maxX + 1) / 2, (bounds.minZ + bounds.maxZ + 1) / 2];
}

export function WorldPlanPreview({ plan, metadata, loading, onRegenerate, onClose }: { plan: WorldPlan; metadata?: WorldPlanMetadata; loading: boolean; onRegenerate: () => void; onClose: () => void }) {
  const { t, number, block, identifier } = useI18n();
  const lots = new Map(plan.lots.map((lot) => [lot.id, lot]));
  const provider = t(`plan.provider.${metadata?.provider ?? "local"}` as MessageKey);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-coal/80 p-4 backdrop-blur-sm">
      <section className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded border border-line bg-panel shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sand">{t("plan.title")}</p>
            <h2 className="mt-1 break-words text-lg font-semibold capitalize">{identifier(plan.name)}</h2>
            <p className="mt-1 text-xs leading-5 text-stone-400">{identifier(plan.theme.name)} · {t("plan.summary", { lots: number(plan.lots.length), bridges: number(plan.connections.filter((connection) => connection.kind === "bridge").length), provider, seed: metadata?.seed === undefined ? "—" : number(metadata.seed, { useGrouping: false }) })}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line text-stone-300 hover:bg-panelSoft"><X className="h-4 w-4" /><span className="sr-only">{t("plan.close")}</span></button>
        </header>

        <div className="grid min-h-0 gap-4 overflow-auto p-4 md:grid-cols-[minmax(280px,1fr)_220px]">
          <div className="relative aspect-square overflow-hidden rounded border border-line bg-[#24241f] shadow-inner" aria-label={t("plan.mapLabel")}>
            <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(#aaa 1px, transparent 1px), linear-gradient(90deg, #aaa 1px, transparent 1px)", backgroundSize: "6.25% 6.25%" }} />
            {plan.roads.map((road) => <div key={road.id} className="absolute border border-stone-400 bg-stone-600/80" style={boxStyle(road.bounds)} title={road.id} />)}
            {plan.lots.map((lot) => {
              const landmark = plan.landmarks.some((item) => item.bounds.minX === lot.bounds.minX && item.bounds.minZ === lot.bounds.minZ && item.bounds.maxX === lot.bounds.maxX && item.bounds.maxZ === lot.bounds.maxZ);
              const purpose = t(`plan.purpose.${lot.purpose}` as MessageKey);
              return <div key={lot.id} className={`absolute flex items-center justify-center overflow-hidden border text-[9px] font-semibold text-white ${landmark ? "border-sand ring-2 ring-sand/60" : "border-white/30"}`} style={{ ...boxStyle(lot.bounds), backgroundColor: LOT_COLORS[lot.purpose] }} title={t("plan.lotTitle", { id: lot.id, purpose, height: number(lot.building.height) })}><span className="truncate px-1">{landmark ? "★ " : ""}{lot.id}<br />{t("plan.heightShort", { height: number(lot.building.height) })}</span></div>;
            })}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 128 128" preserveAspectRatio="none" aria-hidden>
              {plan.connections.filter((connection) => connection.kind === "bridge").map((connection) => {
                const from = lots.get(connection.fromRegionId); const to = lots.get(connection.toRegionId);
                if (!from || !to) return null;
                const [x1, y1] = center(from.bounds); const [x2, y2] = center(to.bounds);
                return <line key={connection.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e6c675" strokeWidth="0.8" strokeDasharray="2 1" />;
              })}
            </svg>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("plan.program")}</p>
              <div className="mt-2 space-y-1.5">
                {plan.lots.map((lot) => <div key={lot.id} className="flex items-center justify-between gap-2 rounded border border-line bg-coal px-2 py-1.5 text-xs"><span className="capitalize text-stone-200">{t(`plan.purpose.${lot.purpose}` as MessageKey)}</span><span className="text-right text-stone-400">{number(lot.building.height)} · {t(`plan.roof.${lot.building.roof}` as MessageKey)}</span></div>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("plan.palette")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{plan.theme.palette.map((material) => <span key={material} className="max-w-full break-words rounded border border-line bg-coal px-2 py-1 text-[10px] text-stone-300">{block(material)}</span>)}</div>
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="min-w-0 text-xs leading-5 text-stone-400">{t("plan.footer")}</p>
          <button type="button" onClick={onRegenerate} disabled={loading} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded border border-[#8a7140] bg-sand px-3 py-2 text-xs font-semibold text-[#252016] disabled:opacity-50"><RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />{loading ? t("plan.planning") : t("plan.regenerate")}</button>
        </footer>
      </section>
    </div>
  );
}
