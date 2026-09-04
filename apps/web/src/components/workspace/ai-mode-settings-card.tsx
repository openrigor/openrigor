"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  assertCurrentSharedModelNoticeVersion,
  isSharedModelNoticeVersionCurrent,
  normalizeOpenRigorAiMode,
  OPENRIGOR_AI_MODES,
  SHARED_MODEL_NOTICE_PATH,
  SHARED_MODEL_NOTICE_VERSION,
} from "@opencanvas/shared/ai-mode";
import type { OpenRigorAiMode } from "@opencanvas/shared/ai-mode";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ByokSettingsCard } from "./byok-settings-card";
import { useTranslations } from "next-intl";

export type AiModeState = {
  mode: OpenRigorAiMode | null;
  privacy_notice_version: string | null;
  revoked_at: string | null;
  updated_at: string | null;
  authorization_state: OpenRigorAiMode | "missing" | "stale" | "revoked";
};

export const AI_MODE_OPTIONS: ReadonlyArray<{
  mode: OpenRigorAiMode;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    mode: "byok",
    labelKey: "byokRecommended",
    descriptionKey: "byokDescription",
  },
  {
    mode: "shared_model",
    labelKey: "sharedModel",
    descriptionKey: "sharedModelDescription",
  },
  {
    mode: "markdown_only",
    labelKey: "markdownOnly",
    descriptionKey: "markdownOnlyDescription",
  },
];

function parseAiModeState(data: unknown): AiModeState {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid AI mode response");
  }
  const value = data as Record<string, unknown>;
  const mode =
    value.mode === null ? null : normalizeOpenRigorAiMode(value.mode);
  if (value.mode !== null && mode === undefined) {
    throw new Error("Invalid AI mode response");
  }
  const state = value.authorization_state;
  const authorizationState =
    typeof state === "string" ? state : (mode ?? "missing");
  if (
    ![...OPENRIGOR_AI_MODES, "missing", "stale", "revoked"].includes(
      authorizationState as never
    )
  ) {
    throw new Error("Invalid AI mode response");
  }
  return {
    mode: mode ?? null,
    privacy_notice_version:
      typeof value.privacy_notice_version === "string"
        ? value.privacy_notice_version
        : null,
    revoked_at: typeof value.revoked_at === "string" ? value.revoked_at : null,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : null,
    authorization_state:
      authorizationState as AiModeState["authorization_state"],
  };
}

export async function loadAiMode(
  fetchFn: typeof fetch = fetch
): Promise<AiModeState> {
  const response = await fetchFn("/api/ai-mode");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data && typeof data.error === "string"
        ? data.error
        : "Could not load AI mode"
    );
  }
  return parseAiModeState(data);
}

export function buildAiModePutBody(
  mode: OpenRigorAiMode,
  sharedNoticeAccepted = false
): Record<string, string> {
  if (mode === "shared_model") {
    if (!sharedNoticeAccepted) {
      throw new Error("Shared-model consent is missing");
    }
    assertCurrentSharedModelNoticeVersion(SHARED_MODEL_NOTICE_VERSION);
    return {
      mode,
      privacy_notice_version: SHARED_MODEL_NOTICE_VERSION,
    };
  }
  return { mode };
}

export async function saveAiMode(
  mode: OpenRigorAiMode,
  sharedNoticeAccepted = false,
  fetchFn: typeof fetch = fetch
): Promise<AiModeState> {
  const response = await fetchFn("/api/ai-mode", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildAiModePutBody(mode, sharedNoticeAccepted)),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data && typeof data.error === "string"
        ? data.error
        : "Could not save AI mode"
    );
  }
  return parseAiModeState(data);
}

export async function revokeAiMode(
  fetchFn: typeof fetch = fetch
): Promise<AiModeState> {
  const response = await fetchFn("/api/ai-mode", { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data && typeof data.error === "string"
        ? data.error
        : "Could not revoke AI mode"
    );
  }
  return parseAiModeState(data);
}

type ModeChoicesProps = {
  selectedMode: OpenRigorAiMode | null;
  disabled?: boolean;
  onModeChange: (mode: OpenRigorAiMode) => void;
};

function ModeChoices({
  selectedMode,
  disabled = false,
  onModeChange,
}: ModeChoicesProps) {
  const t = useTranslations("workspace");
  return (
    <div
      className="grid gap-3"
      role="radiogroup"
      aria-label="OpenRigor AI mode"
      data-testid="ai-mode-choices"
    >
      {AI_MODE_OPTIONS.map(({ mode, labelKey, descriptionKey }) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={selectedMode === mode}
          disabled={disabled}
          onClick={() => onModeChange(mode)}
          data-testid={"ai-mode-" + mode}
          className={[
            "rounded-lg border p-4 text-left transition-colors",
            selectedMode === mode
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-slate-200 bg-white hover:border-primary/60",
            mode === "byok" ? "border-indigo-300" : "",
          ].join(" ")}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-900">{t(labelKey)}</span>
            {mode === "byok" ? (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {t("recommended")}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-sm text-slate-600">
            {t(descriptionKey)}
          </span>
        </button>
      ))}
    </div>
  );
}

type AiModeSettingsCardViewProps = {
  state: AiModeState | null;
  selectedMode: OpenRigorAiMode | null;
  sharedNoticeAccepted: boolean;
  saving: boolean;
  revoking: boolean;
  error: string | null;
  onModeChange: (mode: OpenRigorAiMode) => void;
  onSharedNoticeAcceptedChange: (accepted: boolean) => void;
  onSave: () => void;
  onRevoke: () => void;
};

export function AiModeSettingsCardView({
  state,
  selectedMode,
  sharedNoticeAccepted,
  saving,
  revoking,
  error,
  onModeChange,
  onSharedNoticeAcceptedChange,
  onSave,
  onRevoke,
}: AiModeSettingsCardViewProps) {
  const t = useTranslations("workspace");
  const saveDisabled =
    saving ||
    selectedMode === null ||
    (selectedMode === "shared_model" && !sharedNoticeAccepted);
  const canRevoke = Boolean(state?.mode) && !state?.revoked_at && !revoking;

  return (
    <Card className="bg-white" data-testid="ai-mode-settings-card">
      <CardHeader>
        <CardTitle>{t("openRigorAiMode")}</CardTitle>
        <CardDescription>{t("aiModeDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state?.authorization_state === "missing" || !state ? (
          <p className="text-sm text-amber-700">{t("aiModeMissing")}</p>
        ) : state.authorization_state === "stale" ? (
          <p className="text-sm text-amber-700">
            {t("sharedModelConsentStale")}
          </p>
        ) : state.authorization_state === "revoked" ? (
          <p className="text-sm text-red-700">{t("aiModeRevoked")}</p>
        ) : (
          <p className="text-sm text-slate-600">
            {t("currentMode")}: <strong>{state.mode}</strong>
          </p>
        )}
        <ModeChoices
          selectedMode={selectedMode}
          disabled={saving || revoking}
          onModeChange={onModeChange}
        />
        {selectedMode === "shared_model" ? (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="shared-model-notice-accepted"
                checked={sharedNoticeAccepted}
                onCheckedChange={(checked) =>
                  onSharedNoticeAcceptedChange(checked === true)
                }
                disabled={saving || revoking}
              />
              <label
                htmlFor="shared-model-notice-accepted"
                className="text-sm text-slate-700"
              >
                {t("acceptVersionedSharedNotice")}
              </label>
            </div>
            <p className="pl-6 text-xs text-slate-600">
              <Link
                href={SHARED_MODEL_NOTICE_PATH}
                className="underline underline-offset-2"
              >
                {t("readNotice")}
              </Link>{" "}
              (version {SHARED_MODEL_NOTICE_VERSION}).
            </p>
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={saveDisabled} onClick={onSave}>
            {saving ? t("saving") : t("saveAiMode")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canRevoke}
            onClick={onRevoke}
          >
            {revoking ? t("revoking") : t("revokeAuthorization")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AiModeSettingsCard() {
  const t = useTranslations("workspace");
  const { toast } = useToast();
  const [state, setState] = useState<AiModeState | null>(null);
  const [selectedMode, setSelectedMode] = useState<OpenRigorAiMode | null>(
    null
  );
  const [sharedNoticeAccepted, setSharedNoticeAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAiMode()
      .then((loaded) => {
        if (cancelled) return;
        setState(loaded);
        setSelectedMode(loaded.mode);
        setSharedNoticeAccepted(
          isSharedModelNoticeVersionCurrent(loaded.privacy_notice_version)
        );
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load AI mode"
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!selectedMode) return;
    setSaving(true);
    setError(null);
    try {
      const next = await saveAiMode(selectedMode, sharedNoticeAccepted);
      setState(next);
      setSelectedMode(next.mode);
      setSharedNoticeAccepted(
        isSharedModelNoticeVersionCurrent(next.privacy_notice_version)
      );
      toast({ title: t("aiModeSaved") });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save AI mode"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    setError(null);
    try {
      const next = await revokeAiMode();
      setState(next);
      setSelectedMode(next.mode);
      setSharedNoticeAccepted(false);
      toast({ title: t("aiModeAuthorizationRevoked") });
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Could not revoke AI mode"
      );
    } finally {
      setRevoking(false);
    }
  }

  return (
    <AiModeSettingsCardView
      state={state}
      selectedMode={selectedMode}
      sharedNoticeAccepted={sharedNoticeAccepted}
      saving={saving}
      revoking={revoking}
      error={error}
      onModeChange={(mode) => {
        setSelectedMode(mode);
        if (mode !== "shared_model") setSharedNoticeAccepted(false);
      }}
      onSharedNoticeAcceptedChange={setSharedNoticeAccepted}
      onSave={() => void handleSave()}
      onRevoke={() => void handleRevoke()}
    />
  );
}

export function AiModeOnboardingDialog() {
  const t = useTranslations("workspace");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<OpenRigorAiMode | null>(
    null
  );
  const [sharedNoticeAccepted, setSharedNoticeAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const loadMode = useCallback(async () => {
    setLoading(true);
    try {
      const state = await loadAiMode();
      setOpen(state.mode === null);
      setError(null);
    } catch (loadError) {
      setOpen(true);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load AI mode"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMode();
  }, [loadMode]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  async function handleSave() {
    if (!selectedMode) return;
    setSaving(true);
    setError(null);
    try {
      await saveAiMode(selectedMode, sharedNoticeAccepted);
      setOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save AI mode"
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div data-testid="ai-mode-onboarding">
      <div className="fixed inset-0 z-40 bg-black/40" aria-hidden />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-mode-onboarding-title"
        tabIndex={-1}
        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(94vw,40rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-white p-6 shadow-xl"
      >
        <h2 id="ai-mode-onboarding-title" className="text-xl font-semibold">
          {t("chooseAiMode")}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("chooseAiModeDescription")}
        </p>
        <div className="mt-5 space-y-4">
          <ModeChoices
            selectedMode={selectedMode}
            disabled={saving}
            onModeChange={(mode) => {
              setSelectedMode(mode);
              if (mode !== "shared_model") setSharedNoticeAccepted(false);
            }}
          />
          {selectedMode === "shared_model" ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="onboarding-shared-model-notice-accepted"
                  checked={sharedNoticeAccepted}
                  onCheckedChange={(checked) =>
                    setSharedNoticeAccepted(checked === true)
                  }
                  disabled={saving}
                />
                <label
                  htmlFor="onboarding-shared-model-notice-accepted"
                  className="text-sm text-slate-700"
                >
                  {t("acceptSharedNotice")}
                </label>
              </div>
              <p className="pl-6 text-xs text-slate-600">
                <Link
                  href={SHARED_MODEL_NOTICE_PATH}
                  className="underline underline-offset-2"
                >
                  {t("readVersionedNotice")}
                </Link>{" "}
                (version {SHARED_MODEL_NOTICE_VERSION}).
              </p>
            </div>
          ) : null}
          {selectedMode === "byok" ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <p className="mb-3 text-sm text-slate-700">
                {t("configureProviderDescription")}
              </p>
              <ByokSettingsCard />
            </div>
          ) : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={loading || saving}
                onClick={() => void loadMode()}
              >
                {loading ? t("retrying") : t("retry")}
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={
              saving ||
              selectedMode === null ||
              (selectedMode === "shared_model" && !sharedNoticeAccepted)
            }
            onClick={() => void handleSave()}
          >
            {saving ? t("saving") : t("continueWithMode")}
          </Button>
        </div>
      </section>
    </div>
  );
}
