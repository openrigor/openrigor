"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, ExternalLink, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentComposerChatInterface } from "@/components/canvas/content-composer";
import NoSSRWrapper from "@/components/NoSSRWrapper";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import type { ArtifactV3, FormAgentContext } from "@opencanvas/shared/types";
import type {
  FormFieldDefinition,
  FormValue,
  MethodWorkspaceItem,
} from "@/lib/workspace/types";
import { WorkspaceItemBanner } from "./workspace-item-banner";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";
import { workspaceItemTitle } from "@/lib/workspace/display";

type EvidenceStatus = "draft" | "submitting" | "submitted" | "filed";
type EvidenceValue = string | number | null;

type EvidencePayload = {
  threadId: string;
  status: EvidenceStatus;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  template: {
    id: string;
    version: string;
    sourcePath: string;
    defaultStage?: string;
    fields: Record<string, FormFieldDefinition>;
    layoutMarkdown: string;
    guidance: string;
  };
  fields: Record<string, FormFieldDefinition>;
  layoutMarkdown: string;
  guidance: string;
  frozenValues: Record<string, EvidenceValue>;
  values?: Record<string, string>;
  method: { id: string; version: string };
};

function displayValue(value: EvidenceValue | FormValue | undefined): string {
  if (Array.isArray(value)) return value.join(", ");
  return value === null || value === undefined ? "" : String(value);
}

export function evidenceEditableValues(
  fields: Record<string, FormFieldDefinition>,
  values: Record<string, EvidenceValue | FormValue>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, field]) => field.readOnly !== true)
      .map(([fieldId]) => [fieldId, displayValue(values[fieldId])])
  );
}

function markEvidencePlaceholders(markdown: string): string {
  return markdown.replace(
    /\{\{([a-z][a-z0-9_-]*)\}\}/g,
    (_token, fieldId: string) => `[{{${fieldId}}}](#evidence-field-${fieldId})`
  );
}

export function EvidenceFieldControl({
  field,
  value,
  error,
  onChange,
  register,
  disabled,
}: {
  field: FormFieldDefinition;
  value: EvidenceValue | FormValue | undefined;
  error?: string;
  onChange: (value: string) => void;
  register: (
    node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  ) => void;
  disabled?: boolean;
}) {
  const id = `evidence-field-${field.id}`;
  const locked = field.readOnly === true || disabled === true;
  const className =
    "mx-1 inline-flex min-w-[12ch] rounded-md border border-slate-300 bg-white px-2 py-1 align-middle text-sm text-slate-900 shadow-sm outline-none focus:border-[#2c3e56] focus:ring-2 focus:ring-[#2c3e56]/20 disabled:bg-slate-100";
  const common = {
    id,
    ref: register,
    value: displayValue(value),
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => onChange(event.target.value),
    disabled: locked,
    required: field.required,
    "aria-label": field.label,
    "aria-invalid": Boolean(error),
    className,
    "data-testid": `evidence-field-${field.id}`,
  };
  const control =
    field.type === "textarea" ? (
      <textarea {...common} rows={field.displayLines || 4} />
    ) : field.type === "select" ? (
      <select {...common}>
        <option value="">Select…</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ) : (
      <input
        {...common}
        type={locked && field.type === "date" ? "text" : field.type}
      />
    );
  return (
    <span className="my-1 inline-flex flex-col align-middle">
      <label htmlFor={id} className="sr-only">
        {field.label}
      </label>
      <span className="inline-flex items-center">
        {control}
        {field.required && (
          <span className="text-xs font-semibold text-rose-600" aria-hidden>
            *
          </span>
        )}
      </span>
      {field.readOnly === true && (
        <span className="mx-1 text-[11px] text-slate-500">
          Frozen run value
        </span>
      )}
      {error && <span className="mx-1 text-xs text-rose-700">{error}</span>}
    </span>
  );
}

export function evidenceSubmitRequest(
  itemId: string,
  threadId: string,
  values: Record<string, EvidenceValue | FormValue>
): { url: string; init: RequestInit } {
  return {
    url: `/api/workspace/items/${encodeURIComponent(itemId)}/evidence/${encodeURIComponent(threadId)}/submit`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ values }),
    },
  };
}

export function EvidenceStatusDisplay({
  status,
  pullRequestUrl,
  pullRequestNumber,
}: {
  status: EvidenceStatus;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}) {
  const locked = status !== "draft";
  return (
    <>
      <span className="flex items-center gap-1 text-xs font-medium capitalize text-slate-700">
        {locked && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />}
        {status}
      </span>
      {pullRequestUrl && (
        <a
          href={pullRequestUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline"
        >
          PR #{pullRequestNumber}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </>
  );
}

function EvidenceMarkdown({
  payload,
  values,
  errors,
  onChange,
  register,
  locked,
}: {
  payload: EvidencePayload;
  values: Record<string, EvidenceValue | FormValue>;
  errors: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  register: (
    fieldId: string,
    node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  ) => void;
  locked: boolean;
}) {
  const components = useMemo(
    () => ({
      a: ({ href, children }: React.ComponentProps<"a">) => {
        const fieldId = href?.match(
          /^#evidence-field-([a-z][a-z0-9_-]*)$/
        )?.[1];
        const field = fieldId ? payload.fields[fieldId] : undefined;
        if (!field || !fieldId) {
          return <a href={href}>{children}</a>;
        }
        return (
          <EvidenceFieldControl
            field={field}
            value={values[fieldId]}
            error={errors[fieldId]}
            onChange={(value) => onChange(fieldId, value)}
            register={(node) => register(fieldId, node)}
            disabled={locked}
          />
        );
      },
      h1: ({ children }: React.ComponentProps<"h1">) => (
        <h1 className="mb-5 text-3xl font-bold text-slate-900">{children}</h1>
      ),
      h2: ({ children }: React.ComponentProps<"h2">) => (
        <h2 className="mb-4 mt-7 text-2xl font-semibold text-slate-900">
          {children}
        </h2>
      ),
      h3: ({ children }: React.ComponentProps<"h3">) => (
        <h3 className="mb-3 mt-6 text-xl font-semibold text-slate-900">
          {children}
        </h3>
      ),
      p: ({ children }: React.ComponentProps<"p">) => (
        <p className="mb-4 leading-7 text-slate-700">{children}</p>
      ),
      ul: ({ children }: React.ComponentProps<"ul">) => (
        <ul className="mb-4 list-disc space-y-1 pl-6 text-slate-700">
          {children}
        </ul>
      ),
      ol: ({ children }: React.ComponentProps<"ol">) => (
        <ol className="mb-4 list-decimal space-y-1 pl-6 text-slate-700">
          {children}
        </ol>
      ),
    }),
    [errors, locked, onChange, payload.fields, register, values]
  );
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markEvidencePlaceholders(payload.layoutMarkdown)}
    </ReactMarkdown>
  );
}

function evidenceArtifact(
  payload: EvidencePayload,
  values: Record<string, EvidenceValue | FormValue>
): ArtifactV3 {
  const markdown = payload.layoutMarkdown.replace(
    /\{\{([a-z][a-z0-9_-]*)\}\}/g,
    (_token, fieldId: string) => displayValue(values[fieldId])
  );
  return {
    currentIndex: 1,
    contents: [
      {
        index: 1,
        type: "text",
        title: "Evidence contribution",
        fullMarkdown: markdown,
      },
    ],
  };
}

export function EvidenceCanvas({
  item,
  threadId,
}: {
  item: MethodWorkspaceItem;
  threadId: string;
}) {
  const { graphData } = useGraphContext();
  const { setThreadId } = useThreadContext();
  const { toast } = useToast();
  const router = useRouter();
  // Stable setters only — the context value object itself is recreated on
  // every provider render, so depending on `graphData` would re-run this
  // effect every render and loop (React error #185).
  const { setArtifact, setChatStarted, setFormContext } = graphData;
  const [payload, setPayload] = useState<EvidencePayload>();
  const [values, setValues] = useState<
    Record<string, EvidenceValue | FormValue>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  useEffect(() => {
    setThreadId(threadId);
  }, [setThreadId, threadId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);
    void fetch(
      `/api/workspace/items/${encodeURIComponent(item.id)}/evidence/${encodeURIComponent(threadId)}`,
      { credentials: "include" }
    )
      .then(async (response) => {
        const body = (await response.json()) as EvidencePayload & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || "Could not load evidence");
        if (cancelled) return;
        setPayload(body);
        const initial = Object.fromEntries(
          Object.entries(body.fields).map(([fieldId, field]) => [
            fieldId,
            field.readOnly
              ? (body.frozenValues[fieldId] ?? "")
              : (body.values?.[fieldId] ?? ""),
          ])
        );
        setValues(initial);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Please try again."
          );
          toast({
            title: "Could not load evidence",
            description:
              error instanceof Error ? error.message : "Please try again.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, threadId, toast, loadAttempt]);

  const editableValues = useMemo(() => {
    if (!payload) return {};
    return evidenceEditableValues(payload.fields, values);
  }, [payload, values]);

  useEffect(() => {
    if (!payload) return;
    if (payload.status !== "draft") return; // locked: never persist further edits
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/evidence/${encodeURIComponent(threadId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ values: editableValues }),
        }
      )
        .then((response) => {
          if (!response.ok) console.warn("Could not persist evidence values");
        })
        .catch((error) => {
          console.warn("Could not persist evidence values", error);
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [editableValues, item.id, payload, threadId]);

  useEffect(() => {
    if (!payload) return;
    const artifact = evidenceArtifact(payload, values);
    setArtifact(artifact);
    setChatStarted(true);
    const formContext: FormAgentContext = {
      templateId: `${payload.template.id}@${payload.template.version}`,
      title: "Evidence contribution",
      description: payload.guidance,
      layoutMarkdown: payload.layoutMarkdown,
      fields: Object.fromEntries(
        Object.entries(payload.fields).map(([fieldId, field]) => [
          fieldId,
          { label: field.label, type: field.type, required: field.required },
        ])
      ),
      values: Object.fromEntries(
        Object.entries(values).map(([fieldId, value]) => [
          fieldId,
          value === null ? "" : value,
        ])
      ),
      methodContext: {
        title: `${payload.method.id} evidence`,
        guidance: payload.guidance,
        briefTemplate: payload.layoutMarkdown,
      },
    };
    setFormContext(formContext);
  }, [payload, setArtifact, setChatStarted, setFormContext, values]);

  const getStreamInput = useCallback(() => {
    if (!payload) return {};
    return {
      artifact: evidenceArtifact(payload, values),
      formContext: graphData.formContext,
    };
  }, [graphData.formContext, payload, values]);

  const register = useCallback(
    (
      _fieldId: string,
      _node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    ) => undefined,
    []
  );

  async function submit() {
    if (!payload) return;
    setSubmitting(true);
    try {
      const request = evidenceSubmitRequest(item.id, threadId, values);
      const response = await fetch(request.url, request.init);
      const body = (await response.json()) as {
        status?: EvidenceStatus;
        pullRequestUrl?: string;
        pullRequestNumber?: number;
        issues?: { fieldId: string; message: string }[];
        error?: string;
      };
      if (!response.ok || !body.status) {
        setErrors(
          Object.fromEntries(
            (body.issues || []).map((issue) => [issue.fieldId, issue.message])
          )
        );
        throw new Error(body.error || "Please correct the highlighted fields.");
      }
      setPayload((current) =>
        current
          ? {
              ...current,
              status: body.status!,
              pullRequestUrl: body.pullRequestUrl,
              pullRequestNumber: body.pullRequestNumber,
            }
          : current
      );
      setErrors({});
      toast({
        title:
          body.status === "filed" ? "Evidence filed" : "Evidence submitted",
        description:
          body.status === "filed"
            ? "The contribution passed the automated gate and was merged."
            : "The research pull request is open for review.",
      });
    } catch (error) {
      if (error instanceof Error) {
        toast({
          title: "Evidence submission failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
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

  if (loading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Loading evidence canvas…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-3 p-8 text-sm text-muted-foreground">
        <p>Could not load the evidence canvas: {loadError}</p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  if (!payload) return null;

  const locked = payload.status !== "draft";
  return (
    <div className="flex h-screen min-h-0 flex-col bg-white">
      <WorkspaceItemBanner item={item} onAbandon={() => setAbandonOpen(true)} />
      <div className="flex shrink-0 items-center justify-between border-b bg-slate-50 px-5 py-2 text-sm">
        <div>
          <span className="font-medium">Evidence contribution</span>{" "}
          <span className="text-muted-foreground">
            {payload.method.id}@{payload.method.version}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <EvidenceStatusDisplay
            status={payload.status}
            pullRequestUrl={payload.pullRequestUrl}
            pullRequestNumber={payload.pullRequestNumber}
          />
          {!locked && (
            <Button
              onClick={() => void submit()}
              disabled={submitting}
              data-testid="evidence-submit"
            >
              {submitting ? "Submitting…" : "Submit evidence"}
            </Button>
          )}
        </div>
      </div>
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {!chatCollapsed && (
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={50}
            className="min-h-0 bg-gray-50/70"
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
          minSize={50}
          maxSize={85}
          className="min-w-0 bg-white"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700">
              {chatCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setChatCollapsed(false)}
                  aria-label="Expand chat"
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              )}
              {workspaceItemTitle(item)}
            </div>
            <main className="min-h-0 flex-1 overflow-y-auto">
              <div className="prose prose-slate mx-auto max-w-4xl px-5 py-8 sm:px-10">
                <EvidenceMarkdown
                  payload={payload}
                  values={values}
                  errors={errors}
                  onChange={(fieldId, value) => {
                    setValues((current) => ({ ...current, [fieldId]: value }));
                    setErrors((current) => {
                      const next = { ...current };
                      delete next[fieldId];
                      return next;
                    });
                  }}
                  register={register}
                  locked={locked}
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
    </div>
  );
}
