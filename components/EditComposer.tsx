"use client";

import { Check, CornerDownLeft, X } from "lucide-react";
import type { PendingEdit } from "@/lib/structure";
import { useI18n } from "@/i18n/LocaleProvider";

type EditComposerProps = {
  value: string;
  pending: PendingEdit | null;
  error: string | null;
  disabled: boolean;
  loading?: boolean;
  plannerLabel?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAccept: () => void;
  onReject: () => void;
};

export function EditComposer({ value, pending, error, disabled, loading = false, plannerLabel, onChange, onSubmit, onAccept, onReject }: EditComposerProps) {
  const { t } = useI18n();
  return (
    <section className="mt-auto border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor="edit-command" className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("edit.heading")}</label>
        <span className="text-right text-[11px] font-semibold text-stone-500">{loading ? t("edit.planning") : pending ? t("edit.previewReady") : plannerLabel ?? t("edit.localPlanner")}</span>
      </div>
      <textarea
        id="edit-command"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSubmit();
        }}
        rows={3}
        disabled={disabled || loading || Boolean(pending)}
        placeholder={t("edit.placeholder")}
        className="w-full resize-none rounded border border-line bg-coal p-3 text-sm leading-5 text-stone-100 placeholder:text-stone-500 disabled:cursor-not-allowed disabled:opacity-55"
      />
      {error && <p role="alert" className="mt-2 text-xs leading-5 text-[#ef9a8f]">{error}</p>}
      {pending ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={onAccept} className="inline-flex h-9 items-center justify-center gap-2 rounded border border-[#458769] bg-[#315f4a] text-sm font-semibold text-white hover:bg-[#397056]">
            <Check className="h-4 w-4" aria-hidden /> {t("edit.accept")}
          </button>
          <button type="button" onClick={onReject} className="inline-flex h-9 items-center justify-center gap-2 rounded border border-[#92524a] bg-[#5f3631] text-sm font-semibold text-white hover:bg-[#714039]">
            <X className="h-4 w-4" aria-hidden /> {t("edit.reject")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={onSubmit} disabled={disabled || loading || !value.trim()} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-line bg-panelSoft text-sm font-semibold text-stone-100 hover:border-sand disabled:cursor-not-allowed disabled:opacity-40">
          <CornerDownLeft className="h-4 w-4" aria-hidden /> {loading ? t("edit.aiPlanning") : t("edit.preview")}
        </button>
      )}
      <p className="mt-2 text-[11px] leading-4 text-stone-500">{t("edit.keyboardHint")}</p>
    </section>
  );
}
