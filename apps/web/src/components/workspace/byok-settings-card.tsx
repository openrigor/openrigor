"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { ByokShareMode } from "@opencanvas/shared/byok/types";

export type ByokTestResult = { ok: boolean; message: string };

export type ByokFormState = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  shareMode?: ByokShareMode;
  sharedItemIds?: string[];
  shareItemIdsReplace?: string[];
};

export type ByokSavedSnapshot = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  shareMode?: ByokShareMode;
  sharedItemIds?: string[];
};

export function revokeSharedItem(
  sharedItemIds: string[],
  itemId: string
): {
  shareMode: ByokShareMode;
  sharedItemIds: string[];
  shareItemIdsReplace: string[];
} {
  const nextSharedItemIds = sharedItemIds.filter((id) => id !== itemId);
  return {
    shareMode: nextSharedItemIds.length > 0 ? "specific_items" : "none",
    sharedItemIds: nextSharedItemIds,
    shareItemIdsReplace: nextSharedItemIds,
  };
}

export function buildByokPutBody(form: ByokFormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    enabled: form.enabled,
    base_url: form.baseUrl.trim(),
    model: form.model.trim(),
  };
  const key = form.apiKey.trim();
  if (key) {
    body.api_key = key;
  }
  if (form.shareMode !== undefined) {
    // The selectable settings-page scopes are none/all_assignments. Keep a
    // legacy or launch-created specific_items scope intact when only provider
    // fields are being saved or its IDs are being revoked.
    body.share_mode = form.shareMode;
  }
  if (form.shareItemIdsReplace !== undefined) {
    body.shareItemIdsReplace = form.shareItemIdsReplace;
  }
  return body;
}

export function isByokFormDirty(
  form: ByokFormState,
  saved: ByokSavedSnapshot | null
): boolean {
  if (!saved) {
    return (
      form.enabled !== true ||
      form.baseUrl.trim() !== "" ||
      form.model.trim() !== "" ||
      form.apiKey.trim() !== ""
    );
  }
  return (
    form.enabled !== saved.enabled ||
    form.baseUrl.trim() !== saved.baseUrl ||
    form.model.trim() !== saved.model ||
    form.apiKey.trim() !== "" ||
    (form.shareMode ?? "none") !== (saved.shareMode ?? "none") ||
    JSON.stringify(form.sharedItemIds ?? []) !==
      JSON.stringify(saved.sharedItemIds ?? [])
  );
}

export async function loadByokSettings(
  fetchFn: typeof fetch = fetch
): Promise<ByokSavedSnapshot | null> {
  const res = await fetchFn("/api/byok");
  if (!res.ok) {
    throw new Error("Failed to load BYOK settings");
  }
  const data = (await res.json()) as {
    settings: {
      enabled: boolean;
      base_url: string;
      model: string;
      api_key_masked: string;
      share_mode?: ByokShareMode;
      shared_item_ids?: string[];
    } | null;
  };
  if (!data.settings) return null;
  return {
    enabled: data.settings.enabled,
    baseUrl: data.settings.base_url,
    model: data.settings.model,
    apiKeyMasked: data.settings.api_key_masked,
    ...(data.settings.share_mode
      ? { shareMode: data.settings.share_mode }
      : {}),
    ...(data.settings.shared_item_ids
      ? { sharedItemIds: data.settings.shared_item_ids }
      : {}),
  };
}

export async function saveByokSettings(
  form: ByokFormState,
  fetchFn: typeof fetch = fetch
): Promise<ByokSavedSnapshot> {
  const res = await fetchFn("/api/byok", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildByokPutBody(form)),
  });
  const data = (await res.json()) as {
    settings?: {
      enabled: boolean;
      base_url: string;
      model: string;
      api_key_masked: string;
      share_mode?: ByokShareMode;
      shared_item_ids?: string[];
    };
    error?: string;
  };
  if (!res.ok || !data.settings) {
    throw new Error(data.error || "Failed to save");
  }
  return {
    enabled: data.settings.enabled,
    baseUrl: data.settings.base_url,
    model: data.settings.model,
    apiKeyMasked: data.settings.api_key_masked,
    ...(data.settings.share_mode
      ? { shareMode: data.settings.share_mode }
      : {}),
    ...(data.settings.shared_item_ids
      ? { sharedItemIds: data.settings.shared_item_ids }
      : {}),
  };
}

export async function testByokConnection(
  fetchFn: typeof fetch = fetch
): Promise<ByokTestResult> {
  const res = await fetchFn("/api/byok/test", { method: "POST" });
  const data = (await res.json()) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  if (!res.ok && data.error) {
    return { ok: false, message: data.error };
  }
  return {
    ok: Boolean(data.ok),
    message: data.message || data.error || "Unknown result",
  };
}

type ByokSettingsCardViewProps = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  savedMaskedKey: string | null;
  saving: boolean;
  testing: boolean;
  testResult: ByokTestResult | null;
  shareMode?: ByokShareMode;
  sharedItemIds?: string[];
  onEnabledChange: (enabled: boolean) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onShareModeChange?: (value: ByokShareMode) => void;
  onRevokeSharedItem?: (itemId: string) => void;
  onSave: () => void;
  onTest: () => void;
};

/** Presentational surface — used by the card and by unit tests. */
export function ByokSettingsCardView({
  enabled,
  baseUrl,
  model,
  apiKey,
  savedMaskedKey,
  saving,
  testing,
  testResult,
  shareMode = "none",
  sharedItemIds = [],
  onEnabledChange,
  onBaseUrlChange,
  onModelChange,
  onApiKeyChange,
  onShareModeChange = () => undefined,
  onRevokeSharedItem = () => undefined,
  onSave,
  onTest,
}: ByokSettingsCardViewProps) {
  const testDisabled = savedMaskedKey === null || testing;

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Your own AI provider</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="flex items-center gap-2">
            <input
              id="byok-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => onEnabledChange(e.target.checked)}
              data-testid="byok-enabled"
            />
            <Label htmlFor="byok-enabled">Use my provider for AI chat</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="byok-base-url">Base URL</Label>
            <Input
              id="byok-base-url"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              autoComplete="off"
              data-testid="byok-base-url"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="byok-model">Model</Label>
            <Input
              id="byok-model"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder="openai/gpt-4o-mini"
              autoComplete="off"
              data-testid="byok-model"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="byok-api-key">API key</Label>
            <Input
              id="byok-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={
                savedMaskedKey
                  ? `Saved key ${savedMaskedKey}`
                  : "Paste your API key"
              }
              autoComplete="off"
              data-testid="byok-api-key"
            />
            {savedMaskedKey ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="byok-masked-key"
              >
                Saved key: {savedMaskedKey}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Your key is encrypted on the server and only used for your own AI
            interactions in evaluchat unless you opt into sharing below. Create
            a dedicated API key with a sensible usage limit.
          </p>
          <div className="space-y-2" data-testid="byok-share-control">
            <Label>Share with assignment participants</Label>
            <div
              className="grid grid-cols-2 gap-1 rounded-md border bg-slate-50 p-1"
              role="radiogroup"
              aria-label="Share with assignment participants"
            >
              {(
                [
                  ["none", "No sharing"],
                  ["all_assignments", "All assignments"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={shareMode === value}
                  className={`rounded px-2 py-1.5 text-xs ${
                    shareMode === value
                      ? "bg-white font-medium shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => onShareModeChange(value)}
                  data-testid={`byok-share-${value}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {shareMode === "specific_items" ? (
              <div
                className="space-y-2 rounded-md border bg-slate-50 p-3"
                data-testid="byok-share-specific-items"
              >
                <p className="text-xs text-muted-foreground">
                  Shared specific assignments
                </p>
                {sharedItemIds.length > 0 ? (
                  <ul className="space-y-1">
                    {sharedItemIds.map((itemId) => (
                      <li
                        key={itemId}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <code title={itemId} className="truncate">
                          {itemId.length > 18
                            ? `${itemId.slice(0, 10)}…${itemId.slice(-6)}`
                            : itemId}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRevokeSharedItem(itemId)}
                          data-testid={`byok-share-revoke-${itemId}`}
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No specific assignments are currently shared.
                  </p>
                )}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Participants see only “Provided by instructor” and the model name.
              They never receive your key or base URL.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving} data-testid="byok-save">
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testDisabled}
              onClick={onTest}
              data-testid="byok-test"
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
          {testResult ? (
            <p
              className={
                testResult.ok
                  ? "text-sm text-green-700"
                  : "text-sm text-red-700"
              }
              data-testid="byok-test-result"
            >
              {testResult.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function ByokSettingsCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [shareMode, setShareMode] = useState<ByokShareMode>("none");
  const [sharedItemIds, setSharedItemIds] = useState<string[]>([]);
  const [shareItemIdsReplace, setShareItemIdsReplace] = useState<
    string[] | undefined
  >();
  const [saved, setSaved] = useState<ByokSavedSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ByokTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadByokSettings();
        if (cancelled || !loaded) return;
        setSaved(loaded);
        setEnabled(loaded.enabled);
        setBaseUrl(loaded.baseUrl);
        setModel(loaded.model);
        setShareMode(loaded.shareMode ?? "none");
        setSharedItemIds(loaded.sharedItemIds ?? []);
        setShareItemIdsReplace(undefined);
      } catch {
        if (!cancelled) {
          toast({
            title: "Could not load provider settings",
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const form: ByokFormState = {
    enabled,
    baseUrl,
    model,
    apiKey,
    shareMode,
    sharedItemIds,
    shareItemIdsReplace,
  };

  function handleShareModeChange(next: ByokShareMode) {
    setShareMode(next);
    if (next !== "specific_items") {
      setSharedItemIds([]);
      setShareItemIdsReplace([]);
    } else {
      setShareItemIdsReplace(undefined);
    }
  }

  function handleRevokeSharedItem(itemId: string) {
    const next = revokeSharedItem(sharedItemIds, itemId);
    setSharedItemIds(next.sharedItemIds);
    setShareItemIdsReplace(next.shareItemIdsReplace);
    // A specific scope with no assignments is not useful; make the clear
    // operation explicit so the PUT route clears shared_item_ids as well.
    setShareMode(next.shareMode);
  }

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    try {
      const next = await saveByokSettings(form);
      setSaved(next);
      setApiKey("");
      setEnabled(next.enabled);
      setBaseUrl(next.baseUrl);
      setModel(next.model);
      setShareMode(next.shareMode ?? "none");
      setSharedItemIds(next.sharedItemIds ?? []);
      setShareItemIdsReplace(undefined);
      toast({ title: "Saved" });
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (saved === null) return;
    if (isByokFormDirty(form, saved)) {
      toast({
        title: "Save your settings first",
        description: "Test uses the saved provider configuration.",
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testByokConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <ByokSettingsCardView
      enabled={enabled}
      baseUrl={baseUrl}
      model={model}
      apiKey={apiKey}
      savedMaskedKey={saved?.apiKeyMasked ?? null}
      saving={saving}
      testing={testing}
      testResult={testResult}
      shareMode={shareMode}
      sharedItemIds={sharedItemIds}
      onEnabledChange={setEnabled}
      onBaseUrlChange={setBaseUrl}
      onModelChange={setModel}
      onApiKeyChange={setApiKey}
      onShareModeChange={handleShareModeChange}
      onRevokeSharedItem={handleRevokeSharedItem}
      onSave={handleSave}
      onTest={handleTest}
    />
  );
}
