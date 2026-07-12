"use client";

import { Hammer, Play } from "lucide-react";
import { EXAMPLE_PROMPTS } from "@/lib/structure";
import { EditComposer } from "@/components/EditComposer";
import type { PendingEdit } from "@/lib/structure";

type PromptPanelProps = {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: (prompt?: string) => void;
  generateLoading?: boolean;
  generateError?: string | null;
  editPrompt: string;
  pendingEdit: PendingEdit | null;
  editError: string | null;
  editDisabled: boolean;
  editLoading?: boolean;
  plannerLabel?: string;
  onEditPromptChange: (prompt: string) => void;
  onPreviewEdit: () => void;
  onAcceptEdit: () => void;
  onRejectEdit: () => void;
};

export function PromptPanel({ prompt, onPromptChange, onGenerate, generateLoading = false, generateError, editPrompt, pendingEdit, editError, editDisabled, editLoading, plannerLabel, onEditPromptChange, onPreviewEdit, onAcceptEdit, onRejectEdit }: PromptPanelProps) {
  return (
    <aside className="flex flex-col gap-4 bg-panel p-4 lg:min-h-screen">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded border border-line bg-coal">
          <Hammer className="h-4 w-4 text-sand" aria-hidden />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">VibeCraft Studio</h1>
          <p className="text-xs text-stone-400">Prompt to Minecraft voxels</p>
        </div>
      </div>

      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Build Prompt</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={7}
          className="w-full resize-none rounded border border-line bg-coal p-3 text-sm leading-6 text-stone-100 shadow-tool placeholder:text-stone-500"
          placeholder="Describe a small Minecraft-style build..."
        />
      </label>

      <button
        type="button"
        onClick={() => onGenerate()}
        disabled={generateLoading || !prompt.trim()}
        className="inline-flex h-10 items-center justify-center gap-2 rounded border border-[#8a7140] bg-sand px-4 text-sm font-semibold text-[#252016] transition hover:bg-[#dfc17b]"
      >
        <Play className="h-4 w-4 fill-current" aria-hidden />
        {generateLoading ? "DeepSeek is designing..." : "Generate"}
      </button>
      {generateError && <p role="alert" className="-mt-2 text-xs leading-5 text-[#ef9a8f]">{generateError}</p>}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Examples</p>
        <div className="flex flex-col gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onGenerate(example)}
              disabled={generateLoading}
              className="rounded border border-line bg-coal px-3 py-2 text-left text-xs leading-5 text-stone-200 transition hover:border-sand hover:bg-panelSoft"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <EditComposer value={editPrompt} pending={pendingEdit} error={editError} disabled={editDisabled} loading={editLoading} plannerLabel={plannerLabel} onChange={onEditPromptChange} onSubmit={onPreviewEdit} onAccept={onAcceptEdit} onReject={onRejectEdit} />
    </aside>
  );
}
