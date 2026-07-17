"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ChevronDown,
  Download,
  Eraser,
  Globe,
  Keyboard,
  Monitor,
  Moon,
  Redo2,
  Settings2,
  Sun,
  Undo2,
} from "lucide-react";
import { useTheme, type ThemeMode } from "./ThemeProvider";

export type StudioToolbarText = {
  keyboard: string;
  settings: string;
  light: string;
  system: string;
  dark: string;
  undo: string;
  redo: string;
  download: string;
  clear: string;
};

export type StudioToolbarProps = {
  languageHref: string;
  languageLabel: string;
  languageTitle: string;
  onOpenSettings: () => void;
  onUndo: () => void;
  undoDisabled: boolean;
  onRedo: () => void;
  redoDisabled: boolean;
  onDownload: () => void;
  downloadDisabled: boolean;
  onClear: () => void;
  clearDisabled: boolean;
  text: StudioToolbarText;
};

function ThemeToggle({ text }: { text: StudioToolbarText }) {
  const { mode, setMode, colors } = useTheme();
  const options: Array<{ value: ThemeMode; icon: ReactNode; label: string }> = [
    { value: "light", icon: <Sun size={12} />, label: text.light },
    { value: "system", icon: <Monitor size={12} />, label: text.system },
    { value: "dark", icon: <Moon size={12} />, label: text.dark },
  ];

  return (
    <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.toolbarBorder}`, transition: "border-color 0.15s" }}>
      {options.map(({ value, icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          title={label}
          aria-label={label}
          aria-pressed={mode === value}
          className="w-6 h-6 flex items-center justify-center"
          style={{
            background: mode === value ? colors.toolbarHover : "transparent",
            color: mode === value ? colors.iconActive : colors.icon,
            border: "none",
            cursor: "pointer",
            transition: "background-color 0.12s, color 0.12s",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = colors.toolbarHover;
            event.currentTarget.style.color = colors.iconActive;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = mode === value ? colors.toolbarHover : "transparent";
            event.currentTarget.style.color = mode === value ? colors.iconActive : colors.icon;
          }}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

function ToolbarSeparator() {
  const { colors } = useTheme();
  return <div className="w-px h-4 flex-shrink-0" style={{ background: colors.toolbarBorder, transition: "background-color 0.15s" }} />;
}

function ToolbarButton({ children, onClick, label, active = false, disabled = false }: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      className="w-7 h-7 flex items-center justify-center rounded-lg"
      style={{
        color: active ? colors.iconActive : colors.icon,
        background: active ? colors.toolbarHover : "transparent",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.32 : 1,
        transition: "background-color 0.12s, color 0.12s, opacity 0.12s",
      }}
      onMouseEnter={(event) => {
        if (disabled) return;
        event.currentTarget.style.background = colors.toolbarHover;
        event.currentTarget.style.color = colors.iconActive;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = active ? colors.toolbarHover : "transparent";
        event.currentTarget.style.color = active ? colors.iconActive : colors.icon;
      }}
    >
      {children}
    </button>
  );
}

export function StudioToolbar({
  languageHref,
  languageLabel,
  languageTitle,
  onOpenSettings,
  onUndo,
  undoDisabled,
  onRedo,
  redoDisabled,
  onDownload,
  downloadDisabled,
  onClear,
  clearDisabled,
  text,
}: StudioToolbarProps) {
  const { colors } = useTheme();
  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
      style={{
        background: colors.toolbarBg,
        backdropFilter: "blur(16px)",
        border: `1px solid ${colors.toolbarBorder}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        transition: "background-color 0.15s, border-color 0.15s",
      }}
      role="toolbar"
      aria-label="Studio"
    >
      <Link
        href={languageHref}
        title={languageTitle}
        aria-label={languageTitle}
        className="flex items-center gap-1 px-2 h-7 rounded-lg text-xs"
        style={{ color: colors.toolbarText, background: "transparent", border: "none", cursor: "pointer", transition: "background-color 0.12s, color 0.12s" }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = colors.toolbarHover;
          event.currentTarget.style.color = colors.iconActive;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent";
          event.currentTarget.style.color = colors.toolbarText;
        }}
      >
        <Globe size={13} />
        <span>{languageLabel}</span>
        <ChevronDown size={10} />
      </Link>

      <ToolbarSeparator />
      <ToolbarButton label={text.keyboard}><Keyboard size={14} /></ToolbarButton>
      <ToolbarButton label={text.settings} onClick={onOpenSettings}><Settings2 size={14} /></ToolbarButton>

      <ToolbarSeparator />
      <ThemeToggle text={text} />
      <ToolbarSeparator />

      <ToolbarButton label={text.undo} onClick={onUndo} disabled={undoDisabled}><Undo2 size={14} /></ToolbarButton>
      <ToolbarButton label={text.redo} onClick={onRedo} disabled={redoDisabled}><Redo2 size={14} /></ToolbarButton>

      <ToolbarSeparator />
      <ToolbarButton label={text.download} onClick={onDownload} disabled={downloadDisabled}><Download size={14} /></ToolbarButton>
      <ToolbarButton label={text.clear} onClick={onClear} disabled={clearDisabled}><Eraser size={14} /></ToolbarButton>
    </div>
  );
}
