"use client";

import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";

type ApiKeyDialogProps = {
  open: boolean;
  initialValue: string;
  onSave: (apiKey: string) => void;
  onClose: () => void;
};

export function ApiKeyDialog({ open, initialValue, onSave, onClose }: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState(initialValue);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) setApiKey(initialValue);
  }, [initialValue, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="deepseek-dialog-title">
      <form
        className="w-full max-w-md rounded border border-line bg-panel p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(apiKey.trim());
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-coal text-sand"><KeyRound className="h-4 w-4" /></div>
            <div>
              <h2 id="deepseek-dialog-title" className="text-sm font-semibold text-stone-100">Connect DeepSeek</h2>
              <p className="mt-1 text-xs leading-5 text-stone-400">Your key stays in this browser session and is sent only to this app&apos;s server when planning an edit.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line text-stone-400 hover:text-stone-100"><X className="h-4 w-4" /></button>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">DeepSeek API key</span>
          <div className="mt-2 flex rounded border border-line bg-coal focus-within:border-sand">
            <input
              autoFocus
              type={visible ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-600"
            />
            <button type="button" onClick={() => setVisible((value) => !value)} title={visible ? "Hide key" : "Show key"} className="flex w-10 items-center justify-center text-stone-400 hover:text-stone-100">
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          {initialValue && <button type="button" onClick={() => onSave("")} className="h-9 rounded border border-line px-3 text-xs font-semibold text-stone-300 hover:bg-panelSoft">Remove key</button>}
          <button type="button" onClick={onClose} className="h-9 rounded border border-line px-3 text-xs font-semibold text-stone-300 hover:bg-panelSoft">Use local</button>
          <button type="submit" disabled={!apiKey.trim()} className="h-9 rounded border border-[#8a7140] bg-sand px-4 text-xs font-semibold text-[#252016] hover:bg-[#dfc17b] disabled:cursor-not-allowed disabled:opacity-40">Connect</button>
        </div>
      </form>
    </div>
  );
}
