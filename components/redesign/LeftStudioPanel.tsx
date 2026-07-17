"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Map,
  MessageSquarePlus,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";

export type StudioInspiration = {
  label: string;
  icon: string;
  prompt: string;
};

export type LeftStudioPanelText = {
  collapse: string;
  expand: string;
  title: string;
  describeBadge: string;
  describeHint: string;
  promptPlaceholder: string;
  inspiration: string;
  planDistrict: string;
  planningDistrict: string;
  generate: string;
  regenerate: string;
  generating: string;
  refine: string;
  refinePlaceholder: string;
  recentRefinements: string;
  preview: string;
  previewing: string;
  accept: string;
  reject: string;
};

export type LeftStudioPanelProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isGenerated: boolean;
  generateError?: string | null;
  generateInfo?: string | null;
  inspirations: StudioInspiration[];
  onUseInspiration: (inspiration: StudioInspiration) => void;
  onPlanDistrict: () => void;
  isPlanningDistrict: boolean;
  planError?: string | null;
  refinePrompt: string;
  onRefinePromptChange: (value: string) => void;
  onRefine: () => void;
  isRefining: boolean;
  refineError?: string | null;
  hasPendingRefinement: boolean;
  onAcceptRefinement: () => void;
  onRejectRefinement: () => void;
  recentRefinements: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  text: LeftStudioPanelText;
};

export function LeftStudioPanel({
  prompt,
  onPromptChange,
  onGenerate,
  isGenerating,
  isGenerated,
  generateError,
  generateInfo,
  inspirations,
  onUseInspiration,
  onPlanDistrict,
  isPlanningDistrict,
  planError,
  refinePrompt,
  onRefinePromptChange,
  onRefine,
  isRefining,
  refineError,
  hasPendingRefinement,
  onAcceptRefinement,
  onRejectRefinement,
  recentRefinements,
  collapsed,
  onToggleCollapse,
  text,
}: LeftStudioPanelProps) {
  const { colors } = useTheme();
  const canGenerate = prompt.trim().length > 0;
  const canRefine = refinePrompt.trim().length > 0 && !isRefining && !hasPendingRefinement;

  return (
    <div className="h-full flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <button
        type="button"
        onClick={onToggleCollapse}
        className="absolute right-0 top-1/2 z-10 w-5 h-10 flex items-center justify-center rounded-l-md"
        style={{
          background: colors.surface,
          color: colors.textMuted,
          transform: "translateY(-50%)",
          border: `1px solid ${colors.border}`,
          borderRight: "none",
          transition: "background-color 0.15s, color 0.15s",
        }}
        title={collapsed ? text.expand : text.collapse}
        aria-label={collapsed ? text.expand : text.collapse}
        onMouseEnter={(event) => { event.currentTarget.style.color = colors.text; }}
        onMouseLeave={(event) => { event.currentTarget.style.color = colors.textMuted; }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
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
            <Building2 size={18} />
            <Wand2 size={18} />
            {isGenerated && <MessageSquarePlus size={18} />}
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
                style={{ background: colors.accentIconBg, transition: "background-color 0.15s" }}
              >
                <Building2 size={13} style={{ color: colors.accent }} />
              </div>
              <span
                className="text-sm tracking-wide"
                style={{ color: colors.textSec, letterSpacing: "0.06em", transition: "color 0.15s" }}
              >
                {text.title}
              </span>
            </div>

            <div style={{ height: 1, background: colors.divider, margin: "0 20px", transition: "background-color 0.15s" }} />

            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <div className="px-5 py-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs rounded-full px-2 py-0.5"
                    style={{ background: colors.stepBadgeBg, color: colors.stepBadgeText, letterSpacing: "0.05em", transition: "background-color 0.15s, color 0.15s" }}
                  >
                    {text.describeBadge}
                  </span>
                  <span className="text-xs" style={{ color: colors.textMuted, transition: "color 0.15s" }}>
                    {text.describeHint}
                  </span>
                </div>

                <textarea
                  value={prompt}
                  onChange={(event) => onPromptChange(event.target.value)}
                  placeholder={text.promptPlaceholder}
                  rows={5}
                  className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    color: colors.inputText,
                    lineHeight: "1.65",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
                  }}
                  onFocus={(event) => { event.currentTarget.style.borderColor = colors.inputFocus; }}
                  onBlur={(event) => { event.currentTarget.style.borderColor = colors.inputBorder; }}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-xs" style={{ color: colors.textMuted, letterSpacing: "0.04em", transition: "color 0.15s" }}>
                    {text.inspiration}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {inspirations.map((inspiration) => (
                      <button
                        key={inspiration.prompt}
                        type="button"
                        onClick={() => onUseInspiration(inspiration)}
                        disabled={isGenerating}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs"
                        style={{
                          background: colors.chipBg,
                          color: colors.chipText,
                          border: `1px solid ${colors.chipBorder}`,
                          transition: "background-color 0.12s, color 0.12s, border-color 0.12s",
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = colors.chipHoverBg;
                          event.currentTarget.style.color = colors.chipHoverText;
                          event.currentTarget.style.borderColor = colors.chipHoverBorder;
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = colors.chipBg;
                          event.currentTarget.style.color = colors.chipText;
                          event.currentTarget.style.borderColor = colors.chipBorder;
                        }}
                      >
                        <span aria-hidden>{inspiration.icon}</span>
                        <span>{inspiration.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onPlanDistrict}
                  disabled={!canGenerate || isPlanningDistrict || isGenerating}
                  className="w-full rounded-xl py-2 flex items-center justify-center gap-2 text-xs"
                  style={{
                    color: colors.secondaryText,
                    background: colors.secondarySoft,
                    border: `1px solid ${colors.border}`,
                    cursor: canGenerate && !isPlanningDistrict && !isGenerating ? "pointer" : "not-allowed",
                    opacity: canGenerate ? 1 : 0.5,
                  }}
                >
                  <Map size={13} />
                  {isPlanningDistrict ? text.planningDistrict : text.planDistrict}
                </button>
                {planError && <p role="alert" className="text-xs leading-relaxed" style={{ color: colors.destructiveHover }}>{planError}</p>}

                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={!canGenerate || isGenerating}
                  className="w-full rounded-xl py-3 flex items-center justify-center gap-2.5 text-sm mt-1"
                  style={{
                    background: canGenerate && !isGenerating ? colors.accentGrad : colors.genDisabledBg,
                    color: canGenerate && !isGenerating ? "#fff" : colors.genDisabledText,
                    cursor: canGenerate && !isGenerating ? "pointer" : "not-allowed",
                    boxShadow: canGenerate && !isGenerating ? `0 4px 20px ${colors.accentShadow}` : "none",
                    fontWeight: 500,
                    border: "none",
                    transition: "background 0.15s, box-shadow 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(event) => {
                    if (!canGenerate || isGenerating) return;
                    event.currentTarget.style.background = colors.accentGradHov;
                    event.currentTarget.style.boxShadow = `0 6px 24px ${colors.accentShadow}`;
                  }}
                  onMouseLeave={(event) => {
                    if (!canGenerate || isGenerating) return;
                    event.currentTarget.style.background = colors.accentGrad;
                    event.currentTarget.style.boxShadow = `0 4px 20px ${colors.accentShadow}`;
                  }}
                >
                  {isGenerating ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 rounded-full border-2 border-transparent"
                        style={{ borderTopColor: "rgba(255,255,255,0.7)" }}
                      />
                      <span>{text.generating}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      <span>{isGenerated ? text.regenerate : text.generate}</span>
                    </>
                  )}
                </button>
                {generateError && <p role="alert" className="text-xs leading-relaxed" style={{ color: colors.destructiveHover }}>{generateError}</p>}
                {generateInfo && !generateError && <p role="status" className="text-xs leading-relaxed" style={{ color: colors.secondary }}>{generateInfo}</p>}

                <AnimatePresence>
                  {isGenerated && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-3 mt-1">
                        <div style={{ flex: 1, height: 1, background: colors.divider, transition: "background-color 0.15s" }} />
                        <span className="text-xs" style={{ color: colors.separatorText, letterSpacing: "0.05em", transition: "color 0.15s" }}>
                          {text.refine}
                        </span>
                        <div style={{ flex: 1, height: 1, background: colors.divider, transition: "background-color 0.15s" }} />
                      </div>

                      <div className="relative">
                        <textarea
                          value={refinePrompt}
                          onChange={(event) => onRefinePromptChange(event.target.value)}
                          placeholder={text.refinePlaceholder}
                          rows={3}
                          disabled={isRefining || hasPendingRefinement}
                          className="w-full resize-none rounded-xl px-4 py-3 pr-10 text-xs outline-none"
                          style={{
                            background: colors.inputBg,
                            border: `1px solid ${colors.inputBorder}`,
                            color: colors.inputText,
                            lineHeight: "1.6",
                            fontFamily: "'Inter', system-ui, sans-serif",
                            transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
                          }}
                          onFocus={(event) => { event.currentTarget.style.borderColor = colors.refineFocus; }}
                          onBlur={(event) => { event.currentTarget.style.borderColor = colors.inputBorder; }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                              event.preventDefault();
                              if (canRefine) onRefine();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => canRefine && onRefine()}
                          disabled={!canRefine}
                          title={isRefining ? text.previewing : text.preview}
                          aria-label={isRefining ? text.previewing : text.preview}
                          className="absolute right-3 bottom-3 rounded-lg w-6 h-6 flex items-center justify-center"
                          style={{
                            background: canRefine ? colors.secondarySoft : "transparent",
                            color: canRefine ? colors.secondary : colors.textMuted,
                            border: "none",
                            cursor: canRefine ? "pointer" : "default",
                            transition: "background-color 0.12s, color 0.12s",
                          }}
                        >
                          {isRefining ? (
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                              <Sparkles size={12} />
                            </motion.div>
                          ) : <CornerDownLeft size={12} />}
                        </button>
                      </div>
                      {refineError && <p role="alert" className="text-xs leading-relaxed" style={{ color: colors.destructiveHover }}>{refineError}</p>}

                      {hasPendingRefinement && (
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={onAcceptRefinement} className="rounded-lg py-2 flex items-center justify-center gap-1.5 text-xs" style={{ background: colors.secondarySoft, border: `1px solid ${colors.secondary}`, color: colors.secondary }}>
                            <Check size={12} /> {text.accept}
                          </button>
                          <button type="button" onClick={onRejectRefinement} className="rounded-lg py-2 flex items-center justify-center gap-1.5 text-xs" style={{ background: "var(--destructive-soft)", border: "1px solid var(--destructive)", color: colors.destructiveHover }}>
                            <X size={12} /> {text.reject}
                          </button>
                        </div>
                      )}

                      {recentRefinements.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs" style={{ color: colors.textMuted, letterSpacing: "0.04em", transition: "color 0.15s" }}>
                            {text.recentRefinements}
                          </span>
                          {recentRefinements.slice(0, 3).map((refinement, index) => (
                            <div key={`${refinement}-${index}`} className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs" style={{ background: colors.surfaceAlt, transition: "background-color 0.15s" }}>
                              <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: colors.secondary, opacity: 0.7, transition: "background-color 0.15s" }} />
                              <span className="truncate" style={{ color: colors.textSec, transition: "color 0.15s" }}>{refinement}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
