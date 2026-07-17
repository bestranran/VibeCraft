"use client";

import { AnimatePresence, motion } from "motion/react";
import { Blocks, Check, Cuboid, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "./ThemeProvider";

const PANEL_WIDTH = 276;
const PANEL_ICON_WIDTH = 52;

export type StudioLayoutProps = {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  toolbar: ReactNode;
  canvas: ReactNode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  projectTitle: string;
  isGenerated: boolean;
  isGenerating: boolean;
  generatingLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  notice?: { kind: "info" | "error"; message: string; actionLabel?: string; onAction?: () => void; onDismiss?: () => void } | null;
  pendingEdit?: { prompt: string; changeLabel: string; acceptLabel: string; rejectLabel: string; onAccept: () => void; onReject: () => void } | null;
  overlay?: ReactNode;
};

function ProjectBadge({ title, isGenerated }: { title: string; isGenerated: boolean }) {
  const { colors } = useTheme();
  return (
    <AnimatePresence>
      {isGenerated && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3 }}
          className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{
            background: colors.badgeBg,
            backdropFilter: "blur(12px)",
            border: `1px solid ${colors.badgeBorder}`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            transition: "background-color 0.15s, border-color 0.15s",
          }}
        >
          <Blocks size={13} style={{ color: colors.accent, transition: "color 0.15s" }} />
          <span className="text-xs truncate max-w-[220px]" style={{ color: colors.badgeText, letterSpacing: "0.04em", fontFamily: "'Inter', system-ui, sans-serif", transition: "color 0.15s" }}>
            {title}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyHint({ title, description }: { title: string; description: string }) {
  const { colors, resolved } = useTheme();
  const cubeColor = resolved === "dark" ? "rgba(255,255,255,0.42)" : "#9fb6b9";
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="relative z-20 flex h-[68px] w-[76px] items-center justify-center"
          style={{ color: cubeColor }}
        >
          <Cuboid width={76} height={68} strokeWidth={1.5} aria-hidden />
        </div>
        <div className="flex flex-col gap-1.5">
          <p style={{ color: colors.textMuted, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, letterSpacing: "0.02em", transition: "color 0.15s" }}>{title}</p>
          <p style={{ color: colors.textMuted, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, opacity: 0.6, transition: "color 0.15s" }}>{description}</p>
        </div>
      </div>
    </div>
  );
}

export function StudioLayout({
  leftPanel,
  rightPanel,
  toolbar,
  canvas,
  leftCollapsed,
  rightCollapsed,
  projectTitle,
  isGenerated,
  isGenerating,
  generatingLabel,
  emptyTitle,
  emptyDescription,
  notice,
  pendingEdit,
  overlay,
}: StudioLayoutProps) {
  const { colors } = useTheme();
  const leftWidth = leftCollapsed ? PANEL_ICON_WIDTH : PANEL_WIDTH;
  const rightWidth = rightCollapsed ? PANEL_ICON_WIDTH : PANEL_WIDTH;

  return (
    <main className="redesign-studio-layout w-full h-screen flex overflow-hidden" style={{ background: colors.appBg, fontFamily: "'Inter', system-ui, sans-serif", transition: "background-color 0.15s ease" }}>
      <motion.div
        animate={{ width: leftWidth }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="redesign-side-panel flex-shrink-0 h-full overflow-hidden"
        style={{ background: colors.panelBg, transition: "background-color 0.15s ease" }}
      >
        {leftPanel}
      </motion.div>

      <div className="w-px flex-shrink-0" style={{ background: colors.sideDivider, transition: "background-color 0.15s" }} />

      <section className="redesign-canvas flex-1 h-full relative min-w-0" aria-label={projectTitle}>
        {toolbar}
        <ProjectBadge title={projectTitle} isGenerated={isGenerated} />
        {canvas}

        <AnimatePresence>
          {!isGenerated && (
            <motion.div key="empty" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="absolute inset-0 pointer-events-none">
              <EmptyHint title={emptyTitle} description={emptyDescription} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-2xl z-20"
              style={{
                background: colors.badgeBg,
                backdropFilter: "blur(12px)",
                border: `1px solid ${colors.badgeBorder}`,
                boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                transition: "background-color 0.15s, border-color 0.15s",
              }}
              role="status"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                className="w-3.5 h-3.5 rounded-full border-2 border-transparent"
                style={{ borderTopColor: colors.accent, transition: "border-color 0.15s" }}
              />
              <span className="text-xs whitespace-nowrap" style={{ color: colors.textSec, letterSpacing: "0.04em", transition: "color 0.15s" }}>{generatingLabel}</span>
              <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: colors.progressTrack, transition: "background-color 0.15s" }}>
                <motion.div
                  className="h-full rounded-full w-1/2"
                  animate={{ x: ["-110%", "220%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  style={{ background: colors.accentGrad }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {notice && (
          <div
            className="absolute left-1/2 top-16 z-30 flex w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-xl px-3 py-2 text-xs leading-5"
            style={{ background: colors.badgeBg, border: `1px solid ${notice.kind === "error" ? colors.destructiveHover : colors.badgeBorder}`, color: notice.kind === "error" ? colors.destructiveHover : colors.textSec, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", backdropFilter: "blur(12px)" }}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            <Cuboid size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{notice.message}</span>
            {notice.actionLabel && notice.onAction ? (
              <button type="button" onClick={notice.onAction} className="rounded-lg px-2 py-1 text-xs" style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.text }}>{notice.actionLabel}</button>
            ) : notice.onDismiss ? (
              <button type="button" onClick={notice.onDismiss} className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: colors.surfaceAlt, border: 0, color: colors.textMuted }} aria-label="Dismiss"><X size={12} /></button>
            ) : null}
          </div>
        )}

        {overlay}

        {pendingEdit && (
          <div className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl p-2" style={{ background: colors.badgeBg, border: `1px solid ${colors.badgeBorder}`, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", backdropFilter: "blur(12px)" }}>
            <span className="hidden max-w-[260px] truncate px-1 text-xs sm:block" style={{ color: colors.textSec }}>{pendingEdit.prompt}</span>
            <span className="whitespace-nowrap text-xs" style={{ color: colors.secondary }}>{pendingEdit.changeLabel}</span>
            <button type="button" onClick={pendingEdit.onAccept} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: colors.secondarySoft, border: `1px solid ${colors.secondary}`, color: colors.secondary }}><Check size={13} />{pendingEdit.acceptLabel}</button>
            <button type="button" onClick={pendingEdit.onReject} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: "var(--destructive-soft)", border: "1px solid var(--destructive)", color: colors.destructiveHover }}><X size={13} />{pendingEdit.rejectLabel}</button>
          </div>
        )}

        <div className="absolute inset-0 pointer-events-none z-[1]" style={{ background: colors.vignette, transition: "background 0.15s" }} />
      </section>

      <div className="w-px flex-shrink-0" style={{ background: colors.sideDivider, transition: "background-color 0.15s" }} />

      <motion.div
        animate={{ width: rightWidth }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="redesign-side-panel flex-shrink-0 h-full overflow-hidden"
        style={{ background: colors.panelBg, transition: "background-color 0.15s ease" }}
      >
        {rightPanel}
      </motion.div>
    </main>
  );
}
