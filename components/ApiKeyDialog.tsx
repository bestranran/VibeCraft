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
  unlimitedBlocks: boolean;
  onUnlimitedBlocksChange: () => void;
  onSave: (provider: AiProvider, apiKey: string, baseUrl: string, apiMode: AiApiMode, model: string) => void;
  onClose: () => void;
};

export function ApiKeyDialog({ open, initialProvider, initialValue, initialBaseUrl, initialApiMode, initialModel, unlimitedBlocks, onUnlimitedBlocksChange, onSave, onClose }: ApiKeyDialogProps) {
  const { locale, t } = useI18n();
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
    <div className="studio-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title">
      <form
        className="studio-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(provider, apiKey.trim(), provider === "claude" ? baseUrl.trim() : "", apiMode, provider === "claude" ? model.trim() : "");
        }}
      >
        <div className="studio-dialog-header">
          <div className="flex gap-3">
            <div className="studio-brand-mark"><KeyRound className="h-4 w-4" /></div>
            <div>
              <h2 id="ai-dialog-title" className="studio-dialog-title">{t("dialog.connectTitle")}</h2>
              <p className="studio-muted-copy">{t("dialog.connectDescription")}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title={t("dialog.close")} aria-label={t("dialog.close")} className="studio-icon-button"><X className="h-4 w-4" /></button>
        </div>

        <label className="mt-5 block">
          <span className="studio-field-label">{t("dialog.provider")}</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)} className="studio-select">
            <option value="deepseek">{t("dialog.provider.deepseek")}</option>
            <option value="claude">{t("dialog.provider.claude")}</option>
          </select>
        </label>

        <label className="mt-4 block">
          <span className="studio-field-label">{t("dialog.apiKey", { provider: provider === "claude" ? "Claude" : "DeepSeek" })}</span>
          <div className="flex rounded-xl border border-[var(--border-subtle)] bg-[var(--input-background)] focus-within:border-[var(--accent-primary)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
            <input
              autoFocus
              type={visible ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <button type="button" onClick={() => setVisible((value) => !value)} title={visible ? t("dialog.hideKey") : t("dialog.showKey")} className="flex w-10 items-center justify-center bg-transparent border-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {provider === "claude" && (
          <div className="mt-4 space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
            <label className="block">
              <span className="studio-field-label">{t("dialog.model")}</span>
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="claude-opus-4-8"
                autoComplete="off"
                className="studio-input"
              />
              <span className="studio-muted-copy block">{t("dialog.modelHint")}</span>
            </label>
            <label className="block">
              <span className="studio-field-label">{t("dialog.baseUrl")}</span>
              <input
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.anthropic.com"
                autoComplete="off"
                className="studio-input"
              />
              <span className="studio-muted-copy block">{baseUrl.trim() ? t("dialog.relayActive") : t("dialog.officialDefault")}</span>
            </label>
            {baseUrl.trim() && (
              <label className="block">
                <span className="studio-field-label">{t("dialog.apiMode")}</span>
                <select value={apiMode} onChange={(event) => setApiMode(event.target.value as AiApiMode)} className="studio-select">
                  <option value="anthropic">{t("dialog.apiMode.anthropic")}</option>
                  <option value="openai-compatible">{t("dialog.apiMode.openai")}</option>
                </select>
              </label>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
          <div className="min-w-0">
            <p className="studio-field-label">{locale === "zh-CN" ? "方块数量限制" : "Block limit"}</p>
            <p className="studio-muted-copy">{t(unlimitedBlocks ? "canvas.unlimitedBlocksOn" : "canvas.unlimitedBlocksOff")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={unlimitedBlocks}
            aria-label={t(unlimitedBlocks ? "canvas.unlimitedBlocksOn" : "canvas.unlimitedBlocksOff")}
            onClick={onUnlimitedBlocksChange}
            className="relative h-6 w-11 shrink-0 rounded-full border-0 p-0 transition-colors"
            style={{ background: unlimitedBlocks ? "var(--accent-primary)" : "var(--border-strong)" }}
          >
            <span
              className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform"
              style={{ left: 3, transform: unlimitedBlocks ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {initialValue && <button type="button" onClick={() => onSave(provider, "", baseUrl.trim(), apiMode, model.trim())} className="studio-button">{t("dialog.removeKey")}</button>}
          <button type="button" onClick={onClose} className="studio-button">{t("dialog.useLocal")}</button>
          <button type="submit" disabled={!apiKey.trim()} className="studio-button studio-button-primary">{t("dialog.connect")}</button>
        </div>
      </form>
    </div>
  );
}
