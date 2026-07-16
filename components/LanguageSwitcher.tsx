"use client";

import Link from "next/link";
import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/LocaleProvider";

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const nextLocale = locale === "zh-CN" ? "en" : "zh-CN";
  const label = nextLocale === "en" ? t("language.en") : t("language.zhCN");
  return (
    <Link
      href={`/${nextLocale}`}
      hrefLang={nextLocale}
      title={`${t("language.label")}: ${label}`}
      className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded border border-line bg-panel px-2 text-xs font-semibold text-stone-200 transition hover:bg-panelSoft"
    >
      <Languages className="h-4 w-4" aria-hidden />
      <span className="hidden min-[460px]:inline">{label}</span>
    </Link>
  );
}
