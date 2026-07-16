"use client";

import { Hammer, Map, Play } from "lucide-react";
import { EXAMPLE_PROMPTS } from "@/lib/structure";
import { EditComposer } from "@/components/EditComposer";
import type { PendingEdit } from "@/lib/structure";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MessageKey } from "@/i18n/messages/en";

type PromptPanelProps = {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: (prompt?: string, displayPrompt?: string) => void;
  generateLoading?: boolean;
  generateError?: string | null;
  generateInfo?: string | null;
  planLoading?: boolean;
  planError?: string | null;
  editPrompt: string;
  pendingEdit: PendingEdit | null;
  editError: string | null;
  editDisabled: boolean;
  editLoading?: boolean;
  plannerLabel?: string;
  onEditPromptChange: (prompt: string) => void;
  onPlanDistrict: () => void;
  onPreviewEdit: () => void;
  onAcceptEdit: () => void;
  onRejectEdit: () => void;
};

export function PromptPanel({ prompt, onPromptChange, onGenerate, generateLoading = false, generateError, generateInfo, planLoading = false, planError, editPrompt, pendingEdit, editError, editDisabled, editLoading, plannerLabel, onEditPromptChange, onPlanDistrict, onPreviewEdit, onAcceptEdit, onRejectEdit }: PromptPanelProps) {
  const { t } = useI18n();
  const exampleKeys: MessageKey[] = ["example.cyberpunk", "example.medieval", "example.japanese"];
  return (
    <aside className="flex flex-col gap-4 bg-panel p-4 lg:min-h-screen">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded border border-line bg-coal">
          <Hammer className="h-4 w-4 text-sand" aria-hidden />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">VibeCraft Studio</h1>
          <p className="text-xs text-stone-400">{t("brand.tagline")}</p>
        </div>
      </div>

      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("prompt.label")}</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={7}
          className="w-full resize-none rounded border border-line bg-coal p-3 text-sm leading-6 text-stone-100 shadow-tool placeholder:text-stone-500"
          placeholder={t("prompt.placeholder")}
        />
      </label>

      <button type="button" onClick={onPlanDistrict} disabled={planLoading || generateLoading || !prompt.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-[#668477] bg-[#405d52] px-4 py-2 text-sm font-semibold text-stone-100 transition hover:bg-[#4b6c60] disabled:opacity-50">
        <Map className="h-4 w-4" aria-hidden />
        {planLoading ? t("prompt.planningDistrict") : t("prompt.planDistrict")}
      </button>
      {planError && <p role="alert" className="-mt-2 text-xs leading-5 text-[#ef9a8f]">{planError}</p>}

      <button
        type="button"
        onClick={() => onGenerate()}
        disabled={generateLoading || !prompt.trim()}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-[#8a7140] bg-sand px-4 py-2 text-sm font-semibold text-[#252016] transition hover:bg-[#dfc17b]"
      >
        <Play className="h-4 w-4 fill-current" aria-hidden />
        {generateLoading ? t("prompt.generating") : t("prompt.generate")}
      </button>
      {generateError && <p role="alert" className="-mt-2 text-xs leading-5 text-[#ef9a8f]">{generateError}</p>}
      {generateInfo && !generateError && <p className="-mt-2 text-xs leading-5 text-[#70d3aa]">{generateInfo}</p>}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("prompt.examples")}</p>
        <div className="flex flex-col gap-2">
          {EXAMPLE_PROMPTS.map((example, index) => (
            <button
              key={example}
              type="button"
              onClick={() => onGenerate(example, t(exampleKeys[index]))}
              disabled={generateLoading}
              className="rounded border border-line bg-coal px-3 py-2 text-left text-xs leading-5 text-stone-200 transition hover:border-sand hover:bg-panelSoft"
            >
              {t(exampleKeys[index])}
            </button>
          ))}
        </div>
      </div>

      <EditComposer value={editPrompt} pending={pendingEdit} error={editError} disabled={editDisabled} loading={editLoading} plannerLabel={plannerLabel} onChange={onEditPromptChange} onSubmit={onPreviewEdit} onAccept={onAcceptEdit} onReject={onRejectEdit} />
    </aside>
  );
}
