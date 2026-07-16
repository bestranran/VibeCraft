"use client";

import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/LocaleProvider";
import type { AiApiMode, AiProvider } from "@/lib/ai-provider";

type ApiKeyDialogProps = {
  open: boolean;
  initialProvider: AiProvider;
  initialValue: string;
  initialBaseUrl: string;
  initialApiMode: AiApiMode;
  initialModel: string;
  onSave: (provider: AiProvider, apiKey: string, baseUrl: string, apiMode: AiApiMode, model: string) => void;
  onClose: () => void;
};

export function ApiKeyDialog({ open, initialProvider, initialValue, initialBaseUrl, initialApiMode, initialModel, onSave, onClose }: ApiKeyDialogProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<AiProvider>(initialProvider);
  const [apiKey, setApiKey] = useState(initialValue);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiMode, setApiMode] = useState<AiApiMode>(initialApiMode);
  const [model, setModel] = useState(initialModel);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setProvider(initialProvider);
      setApiKey(initialValue);
      setBaseUrl(initialBaseUrl);
      setApiMode(initialApiMode);
      setModel(initialModel);
    }
  }, [initialApiMode, initialBaseUrl, initialModel, initialProvider, initialValue, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title">
      <form
        className="w-full max-w-md rounded border border-line bg-panel p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(provider, apiKey.trim(), provider === "claude" ? baseUrl.trim() : "", apiMode, provider === "claude" ? model.trim() : "");
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-coal text-sand"><KeyRound className="h-4 w-4" /></div>
            <div>
              <h2 id="ai-dialog-title" className="text-sm font-semibold text-stone-100">{t("dialog.connectTitle")}</h2>
              <p className="mt-1 text-xs leading-5 text-stone-400">{t("dialog.connectDescription")}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title={t("dialog.close")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line text-stone-400 hover:text-stone-100"><X className="h-4 w-4" /></button>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("dialog.provider")}</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)} className="mt-2 h-10 w-full rounded border border-line bg-coal px-3 text-sm text-stone-100 outline-none focus:border-sand">
            <option value="deepseek">{t("dialog.provider.deepseek")}</option>
            <option value="claude">{t("dialog.provider.claude")}</option>
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("dialog.apiKey", { provider: provider === "claude" ? "Claude" : "DeepSeek" })}</span>
          <div className="mt-2 flex rounded border border-line bg-coal focus-within:border-sand">
            <input
              autoFocus
              type={visible ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-600"
            />
            <button type="button" onClick={() => setVisible((value) => !value)} title={visible ? t("dialog.hideKey") : t("dialog.showKey")} className="flex w-10 items-center justify-center text-stone-400 hover:text-stone-100">
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {provider === "claude" && (
          <div className="mt-4 space-y-4 rounded border border-line bg-coal/45 p-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("dialog.model")}</span>
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="claude-opus-4-8"
                autoComplete="off"
                className="mt-2 w-full rounded border border-line bg-coal px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-sand"
              />
              <span className="mt-1.5 block text-[11px] leading-4 text-stone-500">{t("dialog.modelHint")}</span>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("dialog.baseUrl")}</span>
              <input
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.anthropic.com"
                autoComplete="off"
                className="mt-2 w-full rounded border border-line bg-coal px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-sand"
              />
              <span className="mt-1.5 block text-[11px] leading-4 text-stone-500">{baseUrl.trim() ? t("dialog.relayActive") : t("dialog.officialDefault")}</span>
            </label>
            {baseUrl.trim() && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t("dialog.apiMode")}</span>
                <select value={apiMode} onChange={(event) => setApiMode(event.target.value as AiApiMode)} className="mt-2 h-10 w-full rounded border border-line bg-coal px-3 text-sm text-stone-100 outline-none focus:border-sand">
                  <option value="anthropic">{t("dialog.apiMode.anthropic")}</option>
                  <option value="openai-compatible">{t("dialog.apiMode.openai")}</option>
                </select>
              </label>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {initialValue && <button type="button" onClick={() => onSave(provider, "", baseUrl.trim(), apiMode, model.trim())} className="h-9 rounded border border-line px-3 text-xs font-semibold text-stone-300 hover:bg-panelSoft">{t("dialog.removeKey")}</button>}
          <button type="button" onClick={onClose} className="h-9 rounded border border-line px-3 text-xs font-semibold text-stone-300 hover:bg-panelSoft">{t("dialog.useLocal")}</button>
          <button type="submit" disabled={!apiKey.trim()} className="h-9 rounded border border-[#8a7140] bg-sand px-4 text-xs font-semibold text-[#252016] hover:bg-[#dfc17b] disabled:cursor-not-allowed disabled:opacity-40">{t("dialog.connect")}</button>
        </div>
      </form>
    </div>
  );
}
