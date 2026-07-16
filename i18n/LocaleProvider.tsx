"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import { blockLabel, formatIdentifier, pluralKey, translate, type MessageValues } from "./resources";
import type { MessageKey } from "./messages/en";
import { formatCurrency, formatDate, formatNumber, formatTime } from "./formatters";

type TranslationContextValue = {
  locale: Locale;
  t: (key: MessageKey, values?: MessageValues) => string;
  plural: (key: string, count: number, values?: MessageValues) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  time: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  currency: (value: number, currencyCode: string) => string;
  block: (id: string) => string;
  identifier: (value: string) => string;
  error: (message: string | undefined, fallback: MessageKey) => string;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<TranslationContextValue>(() => {
    const t = (key: MessageKey, values?: MessageValues) => translate(locale, key, values);
    return {
      locale,
      t,
      plural: (key, count, values = {}) => t(pluralKey(locale, key, count), { ...values, count: formatNumber(locale, count) }),
      number: (input, options) => formatNumber(locale, input, options),
      date: (input, options) => formatDate(locale, input, options),
      time: (input, options) => formatTime(locale, input, options),
      currency: (input, currencyCode) => formatCurrency(locale, input, currencyCode),
      block: (id) => blockLabel(locale, id),
      identifier: (input) => formatIdentifier(locale, input),
      error: (message, fallback) => localizeError(message, fallback, t)
    };
  }, [locale]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useI18n() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("useI18n must be used inside LocaleProvider");
  return context;
}

function localizeError(message: string | undefined, fallback: MessageKey, t: (key: MessageKey) => string) {
  if (!message) return t(fallback);
  const normalized = message.toLowerCase();
  if (/(timeout|timed out|aborted due to timeout)/.test(normalized)) return t("errors.timeout");
  if (normalized.includes("claude") || normalized.includes("anthropic")) return t("errors.claudeFailed");
  if (normalized.includes("deepseek")) return t("errors.deepSeekFailed");
  if (/(storage|saved project|saved document|locally|invalid json)/.test(normalized)) return t("errors.storageFailed");
  if (/(schematic|export)/.test(normalized)) return t("errors.exportFailed");
  if (/(world plan|district|seed)/.test(normalized)) return t("errors.planFailed");
  if (/(invalid|required|must |outside|duplicate|material|coordinate|structure|block|operation|tool call|semanticregion)/.test(normalized)) {
    const summary = t("errors.validationFailed");
    return normalized === summary.toLowerCase() ? summary : `${summary} ${message}`;
  }
  return t(fallback);
}
