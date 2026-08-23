"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, PanelRightClose } from "lucide-react";
import { HumanMessage } from "@langchain/core/messages";
import type { LedgerSnapshotAgentContext } from "@opencanvas/shared";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import { ContentComposerChatInterface } from "@/components/canvas/content-composer";
import NoSSRWrapper from "@/components/NoSSRWrapper";
import { ReadonlyMarkdownRendererSuspense } from "@/components/artifacts/readonly-markdown-renderer-lazy";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAssistantContext } from "@/contexts/AssistantContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import type { EvidenceLedgerManifest } from "@/lib/apparatuses/evidence-ledger";
import { convertToOpenAIFormat } from "@/lib/convert_messages";
import { workspaceItemTitle } from "@/lib/workspace/display";
import {
  canRepublishClosedPullRequest,
  publicationStatusText,
} from "@/lib/workspace/ledger-publication";
import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";
import { useToast } from "@/hooks/use-toast";
import { LedgerPublishDialog } from "./ledger-publish-dialog";
import { renderLedgerSnapshotCanvasMarkdown } from "./ledger-snapshot-markdown";
import { WorkspaceItemBanner } from "./workspace-item-banner";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";

const MAX_SNAPSHOT_DIMENSIONS = 24;
const MAX_SNAPSHOT_VALUES_PER_DIMENSION = 24;
const MAX_SNAPSHOT_GAP_PATHS = 50;
const MAX_SNAPSHOT_PREDICATE_LENGTH = 500;
const MAX_SNAPSHOT_DIMENSION_ID_LENGTH = 80;
const MAX_SNAPSHOT_DIMENSION_VALUE_LENGTH = 120;
const MAX_SNAPSHOT_GAP_PATH_LENGTH = 300;
const MAX_SNAPSHOT_LABEL_LENGTH = 120;
const MAX_SNAPSHOT_ID_LENGTH = 100;
const MAX_SNAPSHOT_PUBLICATION_URL_LENGTH = 300;
const MAX_SNAPSHOT_CONTEXT_LENGTH = 6000;

function truncateSnapshotString(
  value: string,
  maxLength: number,
  field: string,
  truncatedFields: Set<string>
): string {
  if (value.length <= maxLength) return value;

  truncatedFields.add(field);
  return `${value.slice(0, maxLength - 1)}…`;
}

function stableKeySuffix(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(-6);
}

function truncateSnapshotKey(
  value: string,
  maxLength: number,
  field: string,
  truncatedFields: Set<string>
): string {
  if (value.length <= maxLength) return value;

  truncatedFields.add(field);
  const suffix = stableKeySuffix(value);
  return `${value.slice(0, maxLength - suffix.length - 1)}…${suffix}`;
}

function uniqueTruncatedSnapshotKeys<T>(
  entries: Iterable<readonly [string, T]>,
  maxLength: number,
  field: string,
  truncatedFields: Set<string>
): Array<[string, T]> {
  const takenKeys = new Set<string>();
  const occurrences = new Map<string, number>();

  return Array.from(entries, ([value, entry]) => {
    const displayKey = truncateSnapshotKey(
      value,
      maxLength,
      field,
      truncatedFields
    );
    let occurrence = occurrences.get(displayKey) ?? 1;
    let uniqueKey = displayKey;

    while (takenKeys.has(uniqueKey)) {
      occurrence += 1;
      const occurrenceSuffix = `~${occurrence}`;
      uniqueKey = `${displayKey.slice(0, maxLength - occurrenceSuffix.length)}${occurrenceSuffix}`;
    }

    occurrences.set(displayKey, occurrence);
    takenKeys.add(uniqueKey);
    return [uniqueKey, entry];
  });
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function manifestFor(
  item: LedgerSnapshotWorkspaceItem
): EvidenceLedgerManifest | undefined {
  const manifest = item.snapshot.manifest;
  return manifest && typeof manifest === "object"
    ? (manifest as EvidenceLedgerManifest)
    : undefined;
}

function perDimension(
  manifest: EvidenceLedgerManifest | undefined,
  truncatedFields: Set<string>
): LedgerSnapshotAgentContext["contributions"]["perDimension"] {
  const distributions = new Map<string, Map<string, number>>();

  for (const contribution of manifest?.contributions ?? []) {
    if (contribution.bucket !== "Included") continue;
    for (const [dimensionId, value] of Object.entries(
      contribution.dimensionValues
    )) {
      const values =
        distributions.get(dimensionId) ?? new Map<string, number>();
      const label =
        value.status === "unknown" ? "unknown" : String(value.value);
      values.set(label, (values.get(label) ?? 0) + 1);
      distributions.set(dimensionId, values);
    }
  }

  if (distributions.size > MAX_SNAPSHOT_DIMENSIONS) {
    truncatedFields.add("contributions.perDimension.dimensionId");
  }

  return Object.fromEntries(
    uniqueTruncatedSnapshotKeys(
      [...distributions.entries()]
        .sort(([left], [right]) => compareStrings(left, right))
        .slice(0, MAX_SNAPSHOT_DIMENSIONS)
        .map(([dimensionId, values]) => {
          if (values.size > MAX_SNAPSHOT_VALUES_PER_DIMENSION) {
            truncatedFields.add("contributions.perDimension.value");
          }
          return [
            dimensionId,
            Object.fromEntries(
              uniqueTruncatedSnapshotKeys(
                [...values.entries()]
                  .sort(([left], [right]) => compareStrings(left, right))
                  .slice(0, MAX_SNAPSHOT_VALUES_PER_DIMENSION),
                MAX_SNAPSHOT_DIMENSION_VALUE_LENGTH,
                "contributions.perDimension.value",
                truncatedFields
              )
            ),
          ];
        }),
      MAX_SNAPSHOT_DIMENSION_ID_LENGTH,
      "contributions.perDimension.dimensionId",
      truncatedFields
    )
  );
}

function boundedBuckets(
  buckets: Record<string, number>,
  truncatedFields: Set<string>
): Record<string, number> {
  return Object.fromEntries(
    uniqueTruncatedSnapshotKeys(
      Object.entries(buckets).sort(([left], [right]) =>
        compareStrings(left, right)
      ),
      MAX_SNAPSHOT_DIMENSION_ID_LENGTH,
      "buckets",
      truncatedFields
    )
  );
}

function serializedContextLength(context: LedgerSnapshotAgentContext): number {
  return JSON.stringify(
    {
      kind: "ledger_snapshot",
      ledgerId: context.ledgerId,
      parentLedgerItemId: context.parentLedgerItemId,
      methodId: context.methodId,
      ...(context.methodTitle !== undefined
        ? { methodTitle: context.methodTitle }
        : {}),
      methodVersion: context.methodVersion,
      templateId: context.templateId,
      templateVersion: context.templateVersion,
      predicate: context.predicate,
      sourceCommit: context.sourceCommit,
      generatedAt: context.generatedAt,
      buckets: context.buckets,
      contributions: context.contributions,
      ...(context.publication ? { publication: context.publication } : {}),
      ...(context.truncated ? { truncated: context.truncated } : {}),
    },
    null,
    2
  ).length;
}

function applyTruncationMetadata(
  context: LedgerSnapshotAgentContext,
  truncatedFields: Set<string>
): void {
  if (truncatedFields.size === 0) return;

  context.truncated = {
    applied: true,
    fields: [...truncatedFields].sort(compareStrings),
  };
}

function enforceSnapshotContextBudget(
  context: LedgerSnapshotAgentContext,
  truncatedFields: Set<string>
): void {
  while (
    serializedContextLength(context) > MAX_SNAPSHOT_CONTEXT_LENGTH &&
    Object.keys(context.contributions.perDimension).length > 0
  ) {
    const [dimensionId] = Object.entries(
      context.contributions.perDimension
    ).sort(([leftId, leftValues], [rightId, rightValues]) => {
      const sizeDifference =
        JSON.stringify([rightId, rightValues]).length -
        JSON.stringify([leftId, leftValues]).length;
      return sizeDifference || compareStrings(leftId, rightId);
    })[0];
    delete context.contributions.perDimension[dimensionId];
    truncatedFields.add("contributions.perDimension");
    applyTruncationMetadata(context, truncatedFields);
  }

  while (
    serializedContextLength(context) > MAX_SNAPSHOT_CONTEXT_LENGTH &&
    context.contributions.gaps.length > 0
  ) {
    const [largestGap] = [...context.contributions.gaps].sort((left, right) => {
      const sizeDifference =
        JSON.stringify(right).length - JSON.stringify(left).length;
      return (
        sizeDifference ||
        compareStrings(left.path, right.path) ||
        compareStrings(left.bucket, right.bucket)
      );
    });
    context.contributions.gaps.splice(
      context.contributions.gaps.indexOf(largestGap),
      1
    );
    truncatedFields.add("contributions.gaps");
    applyTruncationMetadata(context, truncatedFields);
  }

  while (
    serializedContextLength(context) > MAX_SNAPSHOT_CONTEXT_LENGTH &&
    Object.keys(context.buckets).length > 0
  ) {
    const bucketKeys = Object.keys(context.buckets).sort(compareStrings);
    delete context.buckets[bucketKeys[bucketKeys.length - 1]];
    truncatedFields.add("buckets");
    applyTruncationMetadata(context, truncatedFields);
  }
}

/**
 * Derive a bounded conversational summary from a sealed snapshot. In
 * particular, never expose contribution rows or the source manifest to the
 * assistant; individual paths are retained only for recorded gaps.
 */
export function buildLedgerSnapshotAgentContext(
  item: LedgerSnapshotWorkspaceItem
): LedgerSnapshotAgentContext {
  const manifest = manifestFor(item);
  const contributions = manifest?.contributions ?? [];
  const truncatedFields = new Set<string>();
  const methodTitle =
    item.source.methodTitle === undefined
      ? undefined
      : truncateSnapshotString(
          item.source.methodTitle,
          MAX_SNAPSHOT_LABEL_LENGTH,
          "methodTitle",
          truncatedFields
        );

  const context: LedgerSnapshotAgentContext = {
    kind: "ledger_snapshot",
    ledgerId: truncateSnapshotString(
      item.snapshot.ledgerId,
      MAX_SNAPSHOT_ID_LENGTH,
      "ledgerId",
      truncatedFields
    ),
    parentLedgerItemId: truncateSnapshotString(
      item.parentLedgerItemId,
      MAX_SNAPSHOT_ID_LENGTH,
      "parentLedgerItemId",
      truncatedFields
    ),
    methodId: truncateSnapshotString(
      item.snapshot.methodId,
      MAX_SNAPSHOT_ID_LENGTH,
      "methodId",
      truncatedFields
    ),
    ...(methodTitle !== undefined ? { methodTitle } : {}),
    methodVersion: truncateSnapshotString(
      item.snapshot.methodVersion,
      MAX_SNAPSHOT_ID_LENGTH,
      "methodVersion",
      truncatedFields
    ),
    templateId: truncateSnapshotString(
      item.snapshot.templateId,
      MAX_SNAPSHOT_LABEL_LENGTH,
      "templateId",
      truncatedFields
    ),
    templateVersion: truncateSnapshotString(
      item.snapshot.templateVersion,
      MAX_SNAPSHOT_ID_LENGTH,
      "templateVersion",
      truncatedFields
    ),
    predicate: truncateSnapshotString(
      item.snapshot.predicate,
      MAX_SNAPSHOT_PREDICATE_LENGTH,
      "predicate",
      truncatedFields
    ),
    sourceCommit: truncateSnapshotString(
      item.snapshot.sourceCommit,
      MAX_SNAPSHOT_ID_LENGTH,
      "sourceCommit",
      truncatedFields
    ),
    generatedAt: truncateSnapshotString(
      item.snapshot.generatedAt,
      MAX_SNAPSHOT_ID_LENGTH,
      "generatedAt",
      truncatedFields
    ),
    buckets: boundedBuckets(item.snapshot.buckets, truncatedFields),
    contributions: {
      included: contributions.filter(
        (contribution) => contribution.bucket === "Included"
      ).length,
      perDimension: perDimension(manifest, truncatedFields),
      gaps: (() => {
        const gaps = contributions
          .filter((contribution) => contribution.bucket !== "Included")
          .map((contribution) => ({
            path: contribution.path,
            bucket: contribution.bucket,
          }))
          .sort(
            (left, right) =>
              compareStrings(left.path, right.path) ||
              compareStrings(left.bucket, right.bucket)
          );
        if (gaps.length > MAX_SNAPSHOT_GAP_PATHS) {
          truncatedFields.add("contributions.gaps.path");
        }
        return gaps.slice(0, MAX_SNAPSHOT_GAP_PATHS).map((gap) => ({
          ...gap,
          path: truncateSnapshotString(
            gap.path,
            MAX_SNAPSHOT_GAP_PATH_LENGTH,
            "contributions.gaps.path",
            truncatedFields
          ),
        }));
      })(),
    },
    ...(item.publication
      ? {
          publication: {
            status: truncateSnapshotString(
              item.publication.status,
              MAX_SNAPSHOT_LABEL_LENGTH,
              "publication.status",
              truncatedFields
            ),
            ...(item.publication.pullRequestUrl
              ? {
                  prUrl: truncateSnapshotString(
                    item.publication.pullRequestUrl,
                    MAX_SNAPSHOT_PUBLICATION_URL_LENGTH,
                    "publication.prUrl",
                    truncatedFields
                  ),
                }
              : {}),
          },
        }
      : {}),
  };

  applyTruncationMetadata(context, truncatedFields);
  enforceSnapshotContextBudget(context, truncatedFields);

  return context;
}

export function LedgerSnapshotCanvas({
  item,
}: {
  item: LedgerSnapshotWorkspaceItem;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { graphData } = useGraphContext();
  const { setThreadId } = useThreadContext();
  const { selectedAssistant } = useAssistantContext();
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [rePublish, setRePublish] = useState(false);
  const [isRefreshingPublication, setIsRefreshingPublication] = useState(false);
  const [publication, setPublication] = useState(item.publication);
  const [pullRequestActual, setPullRequestActual] = useState<{
    state?: string;
    merged?: boolean;
  }>();
  const bootstrappedItem = useRef<string | null>(null);
  const kickedOffItem = useRef<string | null>(null);
  const snapshotContext = useMemo(
    () => buildLedgerSnapshotAgentContext({ ...item, publication }),
    [item, publication]
  );
  const snapshotMarkdown = useMemo(
    () => renderLedgerSnapshotCanvasMarkdown(item.snapshot, item.config),
    [item.config, item.snapshot]
  );

  useEffect(() => {
    setPublication(item.publication);
    setPullRequestActual(undefined);
  }, [item.publication]);

  useEffect(() => {
    if (bootstrappedItem.current === item.id) return;
    bootstrappedItem.current = item.id;
    graphData.clearState();
    void setThreadId(null);
    graphData.setChatStarted(true);
    // Snapshot context is rebuilt from this sealed item rather than persisted
    // in the conversation thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    graphData.setLedgerSnapshotContext(snapshotContext);
    return () => graphData.setLedgerSnapshotContext(undefined);
  }, [graphData.setLedgerSnapshotContext, snapshotContext]);

  const getStreamInput = useCallback(
    () => ({
      ledgerSnapshotContext: snapshotContext,
      next: "replyToGeneralInput",
    }),
    [snapshotContext]
  );

  useEffect(() => {
    if (
      kickedOffItem.current === item.id ||
      !selectedAssistant ||
      graphData.isStreaming ||
      graphData.messages.length > 0
    ) {
      return;
    }

    kickedOffItem.current = item.id;
    const kickoff = new HumanMessage({
      id: `ledger-snapshot-kickoff-${item.id}`,
      content:
        "Open this Evidence Ledger snapshot, understand the sealed record (predicate, buckets, contributions, gaps, publication state) and welcome the user. Answer questions about the snapshot; it is immutable.",
      additional_kwargs: { [OC_HIDE_FROM_UI_KEY]: true },
    });
    graphData.setMessages([kickoff]);
    void graphData
      .streamMessage({
        ...getStreamInput(),
        messages: [convertToOpenAIFormat(kickoff)],
      })
      .catch((error) => {
        kickedOffItem.current = null;
        graphData.setMessages((messages) =>
          messages.filter((message) => message.id !== kickoff.id)
        );
        console.error("Ledger snapshot workspace kickoff failed", error);
        toast({
          title: "Could not open snapshot chat",
          description: "Please try again.",
          variant: "destructive",
        });
      });
  }, [getStreamInput, graphData, item.id, selectedAssistant, toast]);

  async function abandonItem() {
    setIsAbandoning(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) throw new Error("Could not abandon workspace item");
      router.push("/workspace");
    } catch (error) {
      toast({
        title: "Could not abandon item",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAbandoning(false);
    }
  }

  async function refreshPublicationStatus() {
    setIsRefreshingPublication(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/publish/status`,
        { method: "POST", credentials: "include" }
      );
      const body = (await response.json().catch(() => ({}))) as {
        publication?: NonNullable<LedgerSnapshotWorkspaceItem["publication"]>;
        actual?: { state?: string; merged?: boolean };
      };
      if (!response.ok || !body.publication) {
        throw new Error("Could not refresh publication status.");
      }
      setPublication(body.publication);
      setPullRequestActual(body.actual);
    } catch (error) {
      toast({
        title: "Could not refresh publication status",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingPublication(false);
    }
  }

  return (
    <div
      className="flex h-screen min-h-0 flex-col bg-white"
      data-testid="ledger-snapshot-canvas"
    >
      <WorkspaceItemBanner
        item={item}
        onAbandon={() => setAbandonOpen(true)}
        {...(!publication
          ? {
              onSubmit: () => {
                setRePublish(false);
                setPublishDialogOpen(true);
              },
              submitLabel: "Create Draft PR",
              submitTestId: "ledger-publish",
            }
          : {
              extraActions: (
                <>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
                    {publicationStatusText(publication, pullRequestActual)}
                  </span>
                  {publication.pullRequestUrl && (
                    <a
                      href={publication.pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-white underline underline-offset-2"
                    >
                      Draft PR <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {publication.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void refreshPublicationStatus()}
                      disabled={isRefreshingPublication}
                      className="h-auto px-1 py-0 text-xs text-white underline underline-offset-2 hover:bg-transparent hover:text-white"
                      data-testid="ledger-refresh-publication"
                    >
                      {isRefreshingPublication ? "Refreshing…" : "Refresh"}
                    </Button>
                  )}
                  {canRepublishClosedPullRequest(
                    publication,
                    pullRequestActual
                  ) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRePublish(true);
                        setPublishDialogOpen(true);
                      }}
                      className="h-auto px-1 py-0 text-xs text-white underline underline-offset-2 hover:bg-transparent hover:text-white"
                      data-testid="ledger-republish"
                    >
                      Republish
                    </Button>
                  )}
                </>
              ),
            })}
      />
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {!chatCollapsed && (
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={50}
            className="min-h-0 bg-gray-50/70 shadow-inner-right"
            id="ledger-snapshot-chat-panel"
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
          id="ledger-snapshot-details-panel"
          order={2}
        >
          <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-1.5">
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
            <main className="min-h-0 flex-1 overflow-y-auto bg-white">
              <div className="mx-auto max-w-4xl space-y-5 px-5 py-8 sm:px-10">
                <header className="rounded-lg border bg-card p-5">
                  <h1 className="text-lg font-semibold">Ledger Snapshot</h1>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">
                        Method / template
                      </dt>
                      <dd>
                        {item.snapshot.methodId}@{item.snapshot.methodVersion} ·{" "}
                        {item.snapshot.templateId}@
                        {item.snapshot.templateVersion}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Source commit</dt>
                      <dd className="break-all font-mono text-xs">
                        {item.snapshot.sourceCommit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Generated</dt>
                      <dd>{item.snapshot.generatedAt}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Render hash</dt>
                      <dd className="break-all font-mono text-xs">
                        {item.snapshot.renderHash}
                      </dd>
                    </div>
                  </dl>
                </header>
                <ReadonlyMarkdownRendererSuspense
                  markdown={snapshotMarkdown}
                  testId="ledger-snapshot-markdown"
                />
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
      <LedgerPublishDialog
        item={item}
        open={publishDialogOpen}
        onOpenChange={(open) => {
          setPublishDialogOpen(open);
          if (!open) setRePublish(false);
        }}
        onPublished={(nextPublication) => {
          setPublication(nextPublication);
          setPullRequestActual(undefined);
          setRePublish(false);
          router.refresh();
        }}
        rePublish={rePublish}
      />
    </div>
  );
}
