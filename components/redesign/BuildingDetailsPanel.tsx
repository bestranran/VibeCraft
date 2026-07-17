"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, Trash2 } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export type BuildingMaterial = {
  id: string;
  name: string;
  sub: string;
  color: string;
  percentage: number;
};

export type BuildingRecentEdit = {
  id: string;
  text: string;
  time: string;
};

export type BuildingDetailsText = {
  collapse: string;
  expand: string;
  title: string;
  empty: string;
  dimensions: string;
  width: string;
  height: string;
  depth: string;
  unit: string;
  blockCount: string;
  quality: string;
  materials: string;
  showAllMaterials: string;
  hideMaterials: string;
  recentEdits: string;
  noEdits: string;
  export: string;
  exporting: string;
  exportSchematic: string;
  exportFunction: string;
  clear: string;
};

export type BuildingDetailsPanelProps = {
  isGenerated: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  dimensions: [string, string, string];
  blockCount: string;
  qualityScore: number;
  qualityLabel: string;
  materials: BuildingMaterial[];
  recentEdits: BuildingRecentEdit[];
  onExportSchematic: () => void;
  onExportFunction: () => void;
  exportLoading: boolean;
  exportError?: string | null;
  onClear: () => void;
  text: BuildingDetailsText;
};

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const { colors } = useTheme();
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-3 py-2.5 flex-1"
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        transition: "background-color 0.15s, border-color 0.15s",
      }}
    >
      <span className="text-xs" style={{ color: colors.textMuted, letterSpacing: "0.04em", transition: "color 0.15s" }}>
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span style={{ color: colors.text, fontSize: 18, fontWeight: 500, lineHeight: 1, transition: "color 0.15s" }}>
          {value}
        </span>
        {unit && <span className="text-xs" style={{ color: colors.textMuted, transition: "color 0.15s" }}>{unit}</span>}
      </div>
    </div>
  );
}

export function BuildingDetailsPanel({
  isGenerated,
  collapsed,
  onToggleCollapse,
  dimensions,
  blockCount,
  qualityScore,
  qualityLabel,
  materials,
  recentEdits,
  onExportSchematic,
  onExportFunction,
  exportLoading,
  exportError,
  onClear,
  text,
}: BuildingDetailsPanelProps) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? materials : materials.slice(0, 3);

  return (
    <div className="h-full flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <button
        type="button"
        onClick={onToggleCollapse}
        className="absolute left-0 top-1/2 z-10 w-5 h-10 flex items-center justify-center rounded-r-md"
        style={{
          background: colors.surface,
          color: colors.textMuted,
          transform: "translateY(-50%)",
          border: `1px solid ${colors.border}`,
          borderLeft: "none",
          transition: "background-color 0.15s, color 0.15s",
        }}
        title={collapsed ? text.expand : text.collapse}
        aria-label={collapsed ? text.expand : text.collapse}
        onMouseEnter={(event) => { event.currentTarget.style.color = colors.text; }}
        onMouseLeave={(event) => { event.currentTarget.style.color = colors.textMuted; }}
      >
        {collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      <AnimatePresence initial={false}>
        {collapsed ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center pt-5 gap-5"
            style={{ color: colors.textMuted }}
          >
            <BarChart3 size={18} />
            {isGenerated && <><Download size={18} /><Trash2 size={18} /></>}
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: colors.secondaryIconBg, transition: "background-color 0.15s" }}
              >
                <BarChart3 size={13} style={{ color: colors.secondary, transition: "color 0.15s" }} />
              </div>
              <span className="text-sm tracking-wide" style={{ color: colors.textSec, letterSpacing: "0.06em", transition: "color 0.15s" }}>
                {text.title}
              </span>
            </div>

            <div style={{ height: 1, background: colors.divider, margin: "0 20px", transition: "background-color 0.15s" }} />

            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5" style={{ scrollbarWidth: "none" }}>
              <AnimatePresence mode="wait">
                {!isGenerated ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-12 gap-3 text-center"
                  >
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: colors.surfaceAlt, transition: "background-color 0.15s" }}>
                      <BarChart3 size={18} style={{ color: colors.textMuted, transition: "color 0.15s" }} />
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: colors.textMuted, maxWidth: 160, transition: "color 0.15s" }}>
                      {text.empty}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col gap-5"
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-xs" style={{ color: colors.textMuted, letterSpacing: "0.05em", transition: "color 0.15s" }}>{text.dimensions}</span>
                      <div className="flex gap-2">
                        <StatCard label={text.width} value={dimensions[0]} unit={text.unit} />
                        <StatCard label={text.height} value={dimensions[1]} unit={text.unit} />
                        <StatCard label={text.depth} value={dimensions[2]} unit={text.unit} />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: colors.surface, border: `1px solid ${colors.border}`, transition: "background-color 0.15s, border-color 0.15s" }}>
                        <span className="text-xs" style={{ color: colors.textMuted, transition: "color 0.15s" }}>{text.blockCount}</span>
                        <span style={{ color: colors.text, fontWeight: 500, fontSize: 15, transition: "color 0.15s" }}>{blockCount}</span>
                      </div>

                      <div className="rounded-xl px-4 py-3 flex flex-col gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}`, transition: "background-color 0.15s, border-color 0.15s" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: colors.textMuted, transition: "color 0.15s" }}>{text.quality}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs" style={{ color: colors.secondary, fontWeight: 500, transition: "color 0.15s" }}>{qualityLabel}</span>
                            <span className="text-xs" style={{ color: colors.textMuted, transition: "color 0.15s" }}>{qualityScore} / 100</span>
                          </div>
                        </div>
                        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: colors.progressTrack, transition: "background-color 0.15s" }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${qualityScore}%` }}
                            transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ background: colors.progressFill }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ height: 1, background: colors.divider, transition: "background-color 0.15s" }} />

                    <div className="flex flex-col gap-2.5">
                      <span className="text-xs" style={{ color: colors.textMuted, letterSpacing: "0.05em", transition: "color 0.15s" }}>{text.materials}</span>
                      <div className="flex flex-col gap-1.5">
                        {visible.map((material, index) => (
                          <motion.div
                            key={material.id}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: index * 0.06 }}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl"
                            style={{ background: colors.surfaceAlt, transition: "background-color 0.15s" }}
                          >
                            <div className="w-4 h-4 rounded-md flex-shrink-0" style={{ background: material.color, boxShadow: `0 0 6px ${material.color}44` }} />
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="text-xs truncate" style={{ color: colors.text, transition: "color 0.15s" }}>{material.name}</span>
                              <span className="truncate" style={{ color: colors.textMuted, fontSize: 10, transition: "color 0.15s" }}>{material.sub}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: colors.progressTrack, transition: "background-color 0.15s" }}>
                                <div className="h-full rounded-full" style={{ width: `${material.percentage}%`, background: material.color, opacity: 0.8 }} />
                              </div>
                              <span style={{ color: colors.textMuted, fontSize: 10, width: 24, textAlign: "right", transition: "color 0.15s" }}>{material.percentage}%</span>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {materials.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setShowAll((current) => !current)}
                          className="flex items-center gap-1.5 text-xs py-1 px-3"
                          style={{ color: colors.textMuted, background: "none", border: "none", cursor: "pointer", transition: "color 0.12s" }}
                          onMouseEnter={(event) => { event.currentTarget.style.color = colors.textSec; }}
                          onMouseLeave={(event) => { event.currentTarget.style.color = colors.textMuted; }}
                        >
                          <motion.div animate={{ rotate: showAll ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown size={12} /></motion.div>
                          {showAll ? text.hideMaterials : `${text.showAllMaterials} (${materials.length})`}
                        </button>
                      )}
                    </div>

                    <div style={{ height: 1, background: colors.divider, transition: "background-color 0.15s" }} />

                    <div className="flex flex-col gap-2">
                      <span className="text-xs" style={{ color: colors.textMuted, letterSpacing: "0.05em", transition: "color 0.15s" }}>{text.recentEdits}</span>
                      {recentEdits.length === 0 ? (
                        <span className="text-xs py-1.5" style={{ color: colors.textMuted }}>{text.noEdits}</span>
                      ) : recentEdits.slice(0, 3).map((edit) => (
                        <div key={edit.id} className="flex items-center gap-2.5 py-1.5">
                          <Clock size={11} style={{ color: colors.textMuted, flexShrink: 0, transition: "color 0.15s" }} />
                          <span className="text-xs flex-1 truncate" style={{ color: colors.textSec, transition: "color 0.15s" }}>{edit.text}</span>
                          <span style={{ color: colors.textMuted, fontSize: 10, transition: "color 0.15s" }}>{edit.time}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="px-5 pb-5 pt-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${colors.divider}`, transition: "border-color 0.15s" }}>
              <details className="relative group">
                <summary
                  className="w-full rounded-xl py-2.5 flex items-center justify-center gap-2 text-sm list-none [&::-webkit-details-marker]:hidden"
                  style={{
                    background: isGenerated ? colors.accentGrad : colors.genDisabledBg,
                    color: isGenerated ? "#fff" : colors.genDisabledText,
                    cursor: isGenerated && !exportLoading ? "pointer" : "not-allowed",
                    boxShadow: isGenerated ? `0 2px 14px ${colors.accentShadow}` : "none",
                    border: "none",
                    fontWeight: 500,
                    pointerEvents: isGenerated && !exportLoading ? "auto" : "none",
                  }}
                >
                  <Download size={14} />
                  <span>{exportLoading ? text.exporting : text.export}</span>
                </summary>
                <div className="absolute right-0 bottom-12 z-30 w-full rounded-xl p-1" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: "var(--shadow-floating)" }}>
                  <button type="button" onClick={onExportSchematic} className="w-full rounded-lg px-3 py-2 text-left text-xs" style={{ color: colors.text, background: "transparent", border: 0 }}>
                    {text.exportSchematic}<span className="block mt-0.5" style={{ color: colors.textMuted, fontSize: 10 }}>.schem · Java 1.20.1</span>
                  </button>
                  <button type="button" onClick={onExportFunction} className="w-full rounded-lg px-3 py-2 text-left text-xs" style={{ color: colors.text, background: "transparent", border: 0 }}>
                    {text.exportFunction}<span className="block mt-0.5" style={{ color: colors.textMuted, fontSize: 10 }}>.mcfunction</span>
                  </button>
                </div>
              </details>

              <button
                type="button"
                onClick={onClear}
                disabled={!isGenerated}
                className="w-full py-2 text-xs text-center"
                style={{
                  background: "none",
                  border: "none",
                  color: isGenerated ? colors.textMuted : colors.genDisabledText,
                  cursor: isGenerated ? "pointer" : "not-allowed",
                  transition: "color 0.12s",
                }}
                onMouseEnter={(event) => { if (isGenerated) event.currentTarget.style.color = colors.destructiveHover; }}
                onMouseLeave={(event) => { if (isGenerated) event.currentTarget.style.color = colors.textMuted; }}
              >
                {text.clear}
              </button>
              {exportError && <p role="alert" className="text-xs leading-relaxed" style={{ color: colors.destructiveHover }}>{exportError}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
