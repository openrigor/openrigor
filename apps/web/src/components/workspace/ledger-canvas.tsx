"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { PanelRightClose } from "lucide-react";
import type { LedgerAgentContext, LedgerConfig } from "@opencanvas/shared";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import { convertToOpenAIFormat } from "@/lib/convert_messages";
import type {
  EvidenceLedgerBucket,
  EvidenceLedgerDimension,
  EvidenceLedgerTemplate,
} from "@/lib/apparatuses/evidence-ledger";
import { workspaceItemTitle } from "@/lib/workspace/display";
import type { LedgerWorkspaceItem } from "@/lib/workspace/types";
import { useAssistantContext } from "@/contexts/AssistantContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ContentComposerChatInterface } from "@/components/canvas/content-composer";
import NoSSRWrapper from "@/components/NoSSRWrapper";
import { useToast } from "@/hooks/use-toast";
import { findLatestLedgerUpdate } from "./ledger-markdown";
import { WorkspaceItemBanner } from "./workspace-item-banner";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";

type Preview = {
  buckets: Record<EvidenceLedgerBucket, number>;
  baselineCount: number;
  predicate: string;
  template: EvidenceLedgerTemplate;
};

function keyFor(config: LedgerConfig): string {
  return JSON.stringify({
    ...config,
    filters: [...config.filters].sort((a, b) =>
      a.fieldId.localeCompare(b.fieldId)
    ),
  });
}

function filterFor(config: LedgerConfig, fieldId: string) {
  return config.filters.find((filter) => filter.fieldId === fieldId);
}

function withFilter(
  config: LedgerConfig,
  fieldId: string,
  next: LedgerConfig["filters"][number] | undefined
): LedgerConfig {
  const filters = config.filters.filter((filter) => filter.fieldId !== fieldId);
  return { ...config, filters: next ? [...filters, next] : filters };
}

function buildLedgerAgentContext(
  item: LedgerWorkspaceItem,
  config: LedgerConfig,
  preview: Preview | undefined,
  template: EvidenceLedgerTemplate | undefined
): LedgerAgentContext {
  return {
    kind: "ledger",
    methodId: item.source.methodId,
    ...(item.source.methodTitle
      ? { methodTitle: item.source.methodTitle }
      : {}),
    methodVersion: item.source.methodVersion,
    templateId: item.source.templateId,
    templateVersion: item.source.templateVersion,
    dimensions: (template?.dimensions ?? []).map((dimension) => ({
      id: dimension.id,
      role: dimension.role,
      control: dimension.control,
      ...(dimension.options ? { options: dimension.options } : {}),
      type: dimension.type === "select" ? "text" : dimension.type,
    })),
    filters: Object.fromEntries(
      config.filters.map((filter) => {
        const { fieldId, ...value } = filter;
        return [fieldId, value];
      })
    ),
    ...(preview?.baselineCount !== undefined
      ? { baselineCount: preview.baselineCount }
      : item.source.baselineAcceptedEvidenceCount !== undefined
        ? { baselineCount: item.source.baselineAcceptedEvidenceCount }
        : {}),
    ...(preview
      ? {
          scope: {
            buckets: preview.buckets,
            predicate: preview.predicate,
          },
        }
      : {}),
  };
}

export function LedgerCanvas({ item }: { item: LedgerWorkspaceItem }) {
  const router = useRouter();
  const { toast } = useToast();
  const { graphData } = useGraphContext();
  const { setThreadId } = useThreadContext();
  const { selectedAssistant } = useAssistantContext();
  const [config, setConfig] = useState<LedgerConfig>(item.ledgerConfig);
  const [configItemId, setConfigItemId] = useState(item.id);
  const [preview, setPreview] = useState<Preview>();
  const [template, setTemplate] = useState<EvidenceLedgerTemplate>();
  const [previewKey, setPreviewKey] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string>();
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const bootstrappedItem = useRef<string | null>(null);
  const kickedOffItem = useRef<string | null>(null);
  const lastAppliedUpdate = useRef<object | null>(null);
  const latestPreviewRequest = useRef(0);
  const pendingDraftSave = useRef<
    { config: LedgerConfig; timeout: number } | undefined
  >();
  const draftSavePromise = useRef<Promise<void>>();
  const configKey = useMemo(() => keyFor(config), [config]);
  const dimensions = useMemo(() => template?.dimensions ?? [], [template]);

  const saveDraft = useCallback(
    (configToSave: LedgerConfig) => {
      const savePromise = (draftSavePromise.current ?? Promise.resolve()).then(
        () =>
          fetch(
            `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/config`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ config: configToSave }),
            }
          )
            .then((response) => {
              if (!response.ok)
                throw new Error("Could not save ledger config draft");
            })
            .catch((error) => {
              console.warn("Could not save ledger config draft", error);
            })
      );
      draftSavePromise.current = savePromise;
      void savePromise.finally(() => {
        if (draftSavePromise.current === savePromise) {
          draftSavePromise.current = undefined;
        }
      });
      return savePromise;
    },
    [item.id]
  );

  const flushPendingDraftSave = useCallback(() => {
    const pendingSave = pendingDraftSave.current;
    if (!pendingSave) return draftSavePromise.current;

    window.clearTimeout(pendingSave.timeout);
    pendingDraftSave.current = undefined;
    return saveDraft(pendingSave.config);
  }, [saveDraft]);

  const refresh = useCallback(
    async (configToPreview = config) => {
      const request = ++latestPreviewRequest.current;
      setLoading(true);
      try {
        const response = await fetch(
          `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ config: configToPreview }),
          }
        );
        if (!response.ok) throw new Error("Could not preview ledger");
        const result = (await response.json()) as Preview;
        if (request !== latestPreviewRequest.current) return;
        setPreview(result);
        setTemplate(result.template);
        setPreviewKey(keyFor(configToPreview));
      } catch {
        if (request !== latestPreviewRequest.current) return;
        setPreview(undefined);
        setPreviewKey(undefined);
      } finally {
        if (request === latestPreviewRequest.current) setLoading(false);
      }
    },
    [config, item.id]
  );

  useEffect(() => {
    setConfig(item.ledgerConfig);
    setConfigItemId(item.id);
    setPreview(undefined);
    setTemplate(undefined);
    setPreviewKey(undefined);
    lastAppliedUpdate.current = null;
    // Item config changes are user edits; reset only at an item boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    void refresh(item.ledgerConfig);
    // An initial server preview supplies both baseline and template metadata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    if (bootstrappedItem.current === item.id) return;
    bootstrappedItem.current = item.id;
    graphData.clearState();
    void setThreadId(null);
    graphData.setChatStarted(true);
    // Ledger drafts persist to their workspace item, never thread state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    if (configItemId !== item.id) return;
    graphData.setLedgerContext(
      buildLedgerAgentContext(item, config, preview, template)
    );
    return () => graphData.setLedgerContext(undefined);
  }, [
    config,
    configItemId,
    graphData.setLedgerContext,
    item,
    preview,
    template,
  ]);

  const getStreamInput = useCallback(
    () => ({
      ledgerContext: buildLedgerAgentContext(item, config, preview, template),
    }),
    [config, item, preview, template]
  );

  useEffect(() => {
    if (
      configItemId !== item.id ||
      kickedOffItem.current === item.id ||
      !preview ||
      !selectedAssistant ||
      graphData.isStreaming ||
      graphData.messages.length > 0
    ) {
      return;
    }

    kickedOffItem.current = item.id;
    const kickoff = new HumanMessage({
      id: `ledger-kickoff-${item.id}`,
      content:
        "Open this Evidence Ledger, understand the method, evidence template, declared dimensions and current filters, and welcome the user. Do not change filters unless the user asks.",
      additional_kwargs: { [OC_HIDE_FROM_UI_KEY]: true },
    });
    graphData.setMessages([kickoff]);
    void graphData
      .streamMessage({
        ...getStreamInput(),
        messages: [convertToOpenAIFormat(kickoff)],
        next: "replyToGeneralInput",
      })
      .catch((error) => {
        kickedOffItem.current = null;
        graphData.setMessages((messages) =>
          messages.filter((message) => message.id !== kickoff.id)
        );
        console.error("Ledger workspace kickoff failed", error);
        toast({
          title: "Could not open ledger chat",
          description: "Please try again.",
          variant: "destructive",
        });
      });
  }, [
    configItemId,
    getStreamInput,
    graphData,
    item.id,
    preview,
    selectedAssistant,
    toast,
  ]);

  useEffect(() => {
    if (
      configItemId !== item.id ||
      graphData.isStreaming ||
      !graphData.messages.length
    ) {
      return;
    }
    const result = findLatestLedgerUpdate(graphData.messages, dimensions);
    if (!result) return;
    const { message: assistantMessage, parsed } = result;
    if (lastAppliedUpdate.current === assistantMessage) return;

    lastAppliedUpdate.current = assistantMessage;
    const nextConfig = { ...config, filters: parsed.updates };
    setConfig(nextConfig);
    void refresh(nextConfig);
    const cleanContent = parsed.cleanContent.trim() || "Updated the ledger.";
    graphData.setMessages((messages) =>
      messages.map((message) =>
        message === assistantMessage
          ? new AIMessage({
              id: message.id,
              content: cleanContent,
              additional_kwargs: message.additional_kwargs,
            })
          : message
      )
    );
  }, [config, configItemId, dimensions, graphData, item.id, refresh]);

  useEffect(() => {
    return () => {
      void flushPendingDraftSave();
    };
  }, [flushPendingDraftSave]);

  useEffect(() => {
    if (configItemId !== item.id) return;
    if (configKey === keyFor(item.ledgerConfig)) return;
    const configToSave = config;
    const timeout = window.setTimeout(() => {
      if (pendingDraftSave.current?.timeout === timeout) {
        pendingDraftSave.current = undefined;
      }
      void saveDraft(configToSave);
    }, 600);
    pendingDraftSave.current = { config: configToSave, timeout };

    return () => {
      if (pendingDraftSave.current?.timeout === timeout) {
        window.clearTimeout(timeout);
        pendingDraftSave.current = undefined;
      }
    };
  }, [config, configItemId, configKey, item.id, item.ledgerConfig, saveDraft]);

  const groups = [
    ["Context", dimensions.filter((dimension) => dimension.role === "context")],
    [
      "Collection",
      dimensions.filter((dimension) => dimension.role === "collection"),
    ],
    ["Method", dimensions.filter((dimension) => dimension.role === "method")],
  ] as const;
  const previewCurrent = previewKey === configKey;

  async function generate() {
    setGenerating(true);
    setGenerateError(undefined);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ config }),
        }
      );
      if (!response.ok) throw new Error("Could not generate ledger");
      const result = (await response.json()) as { item: { id: string } };
      router.push(`/workspace/items/${encodeURIComponent(result.item.id)}`);
    } catch (error) {
      setGenerateError(
        error instanceof Error && error.message
          ? error.message
          : "Ledger generation failed. Try again."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function abandonItem() {
    setIsAbandoning(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) throw new Error("Could not abandon workspace item");
      setAbandonOpen(false);
      router.push("/workspace");
    } catch (error) {
      console.error("Failed to abandon ledger item", error);
      toast({
        title: "Could not abandon item",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAbandoning(false);
    }
  }

  return (
    <div
      className="flex h-screen min-h-0 flex-col bg-white"
      data-testid="ledger-canvas"
    >
      <WorkspaceItemBanner
        item={item}
        onAbandon={() => setAbandonOpen(true)}
        onSubmit={() => void generate()}
        submitDisabled={!previewCurrent || loading || generating}
        submitLabel="Generate ledger"
        submitTestId="generate-ledger"
      />
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {!chatCollapsed && (
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={50}
            className="min-h-0 bg-gray-50/70 shadow-inner-right"
            id="ledger-chat-panel"
            order={1}
          >
            <NoSSRWrapper>
              <ContentComposerChatInterface
                minimalCanvas
                chatCollapsed={chatCollapsed}
                setChatCollapsed={setChatCollapsed}
                setChatStarted={graphData.setChatStarted}
                hasChatStarted={graphData.chatStarted}
                switchSelectedThreadCallback={graphData.switchSelectedThread}
                handleQuickStart={() => undefined}
                getStreamInput={getStreamInput}
              />
            </NoSSRWrapper>
          </ResizablePanel>
        )}
        {!chatCollapsed && <ResizableHandle />}
        <ResizablePanel
          defaultSize={chatCollapsed ? 100 : 75}
          minSize={chatCollapsed ? 100 : 50}
          maxSize={chatCollapsed ? 100 : 85}
          className="min-w-0 bg-white"
          id="ledger-editor-panel"
          order={2}
        >
          <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                {chatCollapsed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setChatCollapsed(false)}
                    aria-label="Expand chat"
                  >
                    <PanelRightClose className="h-4 w-4 text-gray-600" />
                  </Button>
                )}
                <span className="truncate text-sm font-medium text-gray-700">
                  {workspaceItemTitle(item)}
                </span>
              </div>
            </div>
            <main className="min-h-0 flex-1 overflow-y-auto bg-white">
              <div className="mx-auto max-w-4xl space-y-6 px-5 py-8 sm:px-10">
                <section className="rounded-lg border bg-card p-5">
                  <h2 className="text-lg font-semibold">
                    Selected Method version
                  </h2>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Method</dt>
                      <dd>{item.source.methodTitle || item.source.methodId}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Method ID / version
                      </dt>
                      <dd>
                        {item.source.methodId}@{item.source.methodVersion}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Evidence template
                      </dt>
                      <dd>
                        {item.source.templateId}@{item.source.templateVersion}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Accepted evidence
                      </dt>
                      <dd>
                        {preview?.baselineCount ??
                          item.source.baselineAcceptedEvidenceCount ??
                          "—"}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-lg border bg-card p-5">
                  <h2 className="font-semibold">
                    All accepted evidence for this Method version
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Baseline:{" "}
                    {preview?.baselineCount ??
                      item.source.baselineAcceptedEvidenceCount ??
                      "—"}
                    . The ledger starts from all accepted evidence for this
                    exact Method version.
                  </p>
                </section>

                <section className="rounded-lg border bg-card p-5">
                  <h2 className="font-semibold">Filter by declared facts</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Only template-declared factual dimensions can narrow the
                    scope.
                  </p>
                  {groups.map(
                    ([name, group]) =>
                      group.length > 0 && (
                        <fieldset key={name} className="mt-5 space-y-4">
                          <legend className="text-sm font-medium">
                            {name}
                          </legend>
                          {group.map((dimension) => (
                            <LedgerFilter
                              key={dimension.id}
                              dimension={dimension}
                              filter={filterFor(config, dimension.id)}
                              onChange={(next) =>
                                setConfig((current) =>
                                  withFilter(current, dimension.id, next)
                                )
                              }
                            />
                          ))}
                        </fieldset>
                      )
                  )}
                  {dimensions.length === 0 && !loading && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      This template declares no ledger dimensions.
                    </p>
                  )}
                </section>

                <section
                  className="rounded-lg border bg-card p-5"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Scope preview</h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refresh()}
                      disabled={loading}
                    >
                      Refresh preview
                    </Button>
                  </div>
                  {loading ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Calculating scope on the server…
                    </p>
                  ) : preview ? (
                    <>
                      {!previewCurrent && (
                        <p className="mt-3 text-sm font-medium text-amber-700">
                          Preview out of date
                        </p>
                      )}
                      <table className="mt-3 w-full text-sm">
                        <tbody>
                          {(
                            Object.entries(preview.buckets) as Array<
                              [EvidenceLedgerBucket, number]
                            >
                          ).map(([bucket, count]) => (
                            <tr key={bucket} className="border-t">
                              <th className="py-2 text-left font-medium">
                                {bucket}
                              </th>
                              <td className="py-2 text-right tabular-nums">
                                {count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-3 break-words font-mono text-xs text-muted-foreground">
                        {preview.predicate}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-destructive">
                      Preview unavailable. Refresh after checking your
                      connection.
                    </p>
                  )}
                </section>
                {generateError && (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                    data-testid="generate-error"
                  >
                    {generateError}
                  </p>
                )}
              </div>
            </main>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <WorkspaceItemDeleteDialog
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        onConfirm={() => void abandonItem()}
        itemTitle={workspaceItemTitle(item)}
        isDeleting={isAbandoning}
        confirmLabel="Abandon"
      />
    </div>
  );
}

export function LedgerFilter({
  dimension,
  filter,
  onChange,
}: {
  dimension: EvidenceLedgerDimension;
  filter: LedgerConfig["filters"][number] | undefined;
  onChange: (filter: LedgerConfig["filters"][number] | undefined) => void;
}) {
  if (dimension.control === "multi-select") {
    const values = filter?.control === "multi-select" ? filter.values : [];
    return (
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{dimension.id}</span>
        <select
          aria-label={dimension.id}
          multiple
          value={values}
          onChange={(event) => {
            const next = Array.from(
              event.currentTarget.selectedOptions,
              (option) => option.value
            );
            onChange(
              next.length
                ? {
                    fieldId: dimension.id,
                    control: "multi-select",
                    values: next,
                  }
                : undefined
            );
          }}
          className="min-h-24 w-full rounded-md border bg-background p-2"
        >
          {dimension.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const range = filter?.control === "range" ? filter : undefined;
  const inputType = dimension.type === "date" ? "date" : "number";
  function change(endpoint: "min" | "max", value: string) {
    const parsed =
      inputType === "number" && value !== ""
        ? Number(value)
        : value || undefined;
    const next = {
      fieldId: dimension.id,
      control: "range" as const,
      min: range?.min,
      max: range?.max,
      [endpoint]: parsed,
    };
    onChange(
      next.min === undefined && next.max === undefined ? undefined : next
    );
  }
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <span className="sm:col-span-2 font-medium">{dimension.id}</span>
      <label>
        Minimum
        <Input
          aria-label={`${dimension.id} minimum`}
          type={inputType}
          value={range?.min ?? ""}
          onChange={(event) => change("min", event.currentTarget.value)}
        />
      </label>
      <label>
        Maximum
        <Input
          aria-label={`${dimension.id} maximum`}
          type={inputType}
          value={range?.max ?? ""}
          onChange={(event) => change("max", event.currentTarget.value)}
        />
      </label>
    </div>
  );
}
