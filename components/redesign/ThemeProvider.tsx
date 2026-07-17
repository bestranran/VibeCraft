"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export type StudioThemeColors = {
  appBg: string;
  panelBg: string;
  sideDivider: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textSec: string;
  textMuted: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputFocus: string;
  refineFocus: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentIconBg: string;
  accentGrad: string;
  accentGradHov: string;
  accentShadow: string;
  secondary: string;
  secondarySoft: string;
  secondaryIconBg: string;
  secondaryText: string;
  toolbarBg: string;
  toolbarBorder: string;
  toolbarText: string;
  toolbarHover: string;
  icon: string;
  iconActive: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  chipHoverBg: string;
  chipHoverBorder: string;
  chipHoverText: string;
  stepBadgeBg: string;
  stepBadgeText: string;
  separatorText: string;
  genDisabledBg: string;
  genDisabledText: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  progressTrack: string;
  progressFill: string;
  vignette: string;
  divider: string;
  destructiveHover: string;
};

const colors: StudioThemeColors = {
  appBg: "var(--background)",
  panelBg: "var(--sidebar-background)",
  sideDivider: "var(--border-subtle)",
  surface: "var(--surface-primary)",
  surfaceAlt: "var(--surface-secondary)",
  border: "var(--border-subtle)",
  text: "var(--text-primary)",
  textSec: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
  inputBg: "var(--input-background)",
  inputBorder: "var(--border-subtle)",
  inputText: "var(--text-primary)",
  inputFocus: "var(--focus-ring)",
  refineFocus: "color-mix(in srgb, var(--success) 45%, transparent)",
  accent: "var(--accent-primary)",
  accentHover: "var(--accent-primary-hover)",
  accentSoft: "var(--accent-soft)",
  accentIconBg: "var(--accent-soft)",
  accentGrad: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-hover) 100%)",
  accentGradHov: "linear-gradient(135deg, var(--accent-primary-hover) 0%, var(--accent-primary) 100%)",
  accentShadow: "color-mix(in srgb, var(--accent-primary) 28%, transparent)",
  secondary: "var(--success)",
  secondarySoft: "var(--success-soft)",
  secondaryIconBg: "var(--success-soft)",
  secondaryText: "var(--success)",
  toolbarBg: "var(--toolbar-background)",
  toolbarBorder: "var(--border-strong)",
  toolbarText: "var(--text-secondary)",
  toolbarHover: "var(--accent-soft)",
  icon: "var(--text-secondary)",
  iconActive: "var(--text-primary)",
  chipBg: "var(--surface-secondary)",
  chipBorder: "var(--border-subtle)",
  chipText: "var(--text-secondary)",
  chipHoverBg: "var(--accent-soft)",
  chipHoverBorder: "var(--accent-primary)",
  chipHoverText: "var(--text-primary)",
  stepBadgeBg: "var(--accent-soft)",
  stepBadgeText: "var(--accent-primary)",
  separatorText: "var(--text-muted)",
  genDisabledBg: "var(--surface-secondary)",
  genDisabledText: "var(--text-muted)",
  badgeBg: "var(--surface-translucent)",
  badgeBorder: "var(--border-strong)",
  badgeText: "var(--text-primary)",
  progressTrack: "var(--surface-secondary)",
  progressFill: "linear-gradient(90deg, var(--success), var(--accent-primary))",
  vignette: "radial-gradient(ellipse at center, transparent 55%, color-mix(in srgb, var(--canvas-gradient-edge) 45%, transparent) 100%)",
  divider: "var(--border-subtle)",
  destructiveHover: "var(--destructive)",
};

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  colors: StudioThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialMode(): ThemeMode {
  if (typeof document === "undefined") return "system";
  const mode = document.documentElement.dataset.themeMode ?? null;
  return isThemeMode(mode) ? mode : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [systemPreference, setSystemPreference] = useState<ResolvedTheme>(systemTheme);
  const resolved = mode === "system" ? systemPreference : mode;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemPreference(event.matches ? "dark" : "light");
    setSystemPreference(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = resolved;
  }, [mode, resolved]);

  function setMode(nextMode: ThemeMode) {
    setModeState(nextMode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch {
      // Keep the in-memory selection when browser storage is unavailable.
    }
  }

  const value = useMemo(() => ({ mode, resolved, colors, setMode }), [mode, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
