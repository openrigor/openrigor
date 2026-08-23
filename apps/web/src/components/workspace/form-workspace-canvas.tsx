"use client";

import React, {
  useCallback,
  createContext,
  useEffect,
  useRef,
  useState,
  useContext,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useRouter } from "next/navigation";
import { CheckCircle2, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { workspaceItemTitle } from "@/lib/workspace/display";
import { publicMethodPageUrl } from "@/lib/workspace/method-links";
import { useWorkspaceItem } from "@/contexts/WorkspaceItemContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useAssistantContext } from "@/contexts/AssistantContext";
import { ContentComposerChatInterface } from "@/components/canvas/content-composer";
import NoSSRWrapper from "@/components/NoSSRWrapper";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { convertToOpenAIFormat } from "@/lib/convert_messages";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import type { ByokShareMode } from "@opencanvas/shared/byok/types";
import type { ArtifactV3, FormAgentContext } from "@opencanvas/shared/types";
import type {
  FormBackedWorkspaceItem,
  FormFieldDefinition,
  FormValue,
} from "@/lib/workspace/types";
import { findLatestFormUpdate, markFormPlaceholders } from "./form-markdown";
import { WorkspaceItemBanner } from "./workspace-item-banner";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";

type FieldErrors = Record<string, string>;

type ByokDialogSettings = {
  enabled: boolean;
  model: string;
  shareMode: ByokShareMode;
  sharedItemIds: string[];
};

function MethodByokShareControl({
  settings,
  loading,
  checked,
  onCheckedChange,
}: {
  settings: ByokDialogSettings | null;
  loading: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  if (loading) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="byok-share-loading"
      >
        Loading provider settings…
      </p>
    );
  }

  if (settings?.enabled && settings.shareMode === "all_assignments") {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="byok-share-all-note"
      >
        Your provider is shared with all assignments — participants will use it.
      </p>
    );
  }

  const disabled = !settings?.enabled;
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          data-testid="share-byok"
        />
        <span>Share my BYOK provider with participants</span>
      </label>
      <p className="pl-6 text-xs text-muted-foreground">
        {disabled
          ? "Configure a provider in workspace settings first"
          : `Participants see “Provided by instructor — ${settings.model}”, never your key.`}
      </p>
    </div>
  );
}

function buildFormAgentContext(
  item: FormBackedWorkspaceItem,
  values: Record<string, FormValue>
): FormAgentContext {
  return {
    templateId: item.templateSnapshot.templateId,
    title: item.templateSnapshot.title,
    description: item.templateSnapshot.description,
    layoutMarkdown: item.templateSnapshot.layoutMarkdown,
    fields: Object.fromEntries(
      Object.entries(item.templateSnapshot.fields).map(([id, field]) => [
        id,
        { label: field.label, type: field.type, required: field.required },
      ])
    ),
    values,
    ...(item.kind === "method"
      ? {
          methodContext: {
            title: item.methodSource.title ?? item.templateSnapshot.title,
            description:
              item.methodSource.description ??
              item.templateSnapshot.description,
            guidance: item.templateSnapshot.assistantGuidance,
            briefTemplate: item.templateSnapshot.layoutMarkdown,
          },
        }
      : {}),
  };
}

function buildFormArtifact(
  item: FormBackedWorkspaceItem,
  values: Record<string, FormValue>
): ArtifactV3 {
  const markdown = item.templateSnapshot.layoutMarkdown.replace(
    /\{\{([a-z][a-z0-9_-]*)\}\}/g,
    (_token, fieldId: string) => {
      const value = values[fieldId];
      return Array.isArray(value)
        ? value.join(", ")
        : value === undefined
          ? ""
          : String(value);
    }
  );
  return {
    currentIndex: 1,
    contents: [
      {
        index: 1,
        type: "text",
        title: item.templateSnapshot.title,
        fullMarkdown: markdown,
      },
    ],
  };
}

function defaultValue(field: FormFieldDefinition): FormValue {
  return field.type === "roster" ? [] : "";
}

function displayValue(value: FormValue | undefined): string {
  return Array.isArray(value)
    ? value.join(", ")
    : value === undefined
      ? ""
      : String(value);
}

function FormFieldControl({
  field,
  value,
  error,
  disabled,
  onChange,
  inputRef,
}: {
  field: FormFieldDefinition;
  value: FormValue | undefined;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  inputRef: (
    node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  ) => void;
}) {
  const id = `workspace-form-${field.id}`;
  const describedBy = error ? `${id}-error` : undefined;
  const className =
    "mx-1 inline-flex min-w-[12ch] rounded-md border border-slate-300 bg-white px-2 py-1 align-middle text-sm text-slate-900 shadow-sm outline-none focus:border-[#2c3e56] focus:ring-2 focus:ring-[#2c3e56]/20 disabled:bg-slate-100";
  const width = field.displayChars
    ? { width: `${Math.min(Math.max(field.displayChars, 12), 80)}ch` }
    : undefined;

  const control =
    field.type === "textarea" ? (
      <textarea
        id={id}
        ref={inputRef}
        rows={field.displayLines || 4}
        value={displayValue(value)}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={field.required}
        aria-label={field.label}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${className} min-w-[24ch] align-top`}
        style={width}
        data-testid={`form-field-${field.id}`}
      />
    ) : field.type === "select" ? (
      <select
        id={id}
        ref={inputRef}
        value={displayValue(value)}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={field.required}
        aria-label={field.label}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={className}
        data-testid={`form-field-${field.id}`}
      >
        <option value="">Select…</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        ref={inputRef}
        type={field.type === "number" ? "number" : field.type}
        value={displayValue(value)}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={field.required}
        aria-label={field.label}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={className}
        style={width}
        data-testid={`form-field-${field.id}`}
      />
    );

  return (
    <span className="my-1 inline-flex flex-col align-middle">
      <label htmlFor={id} className="sr-only">
        {field.label}
        {field.required ? " (required)" : ""}
      </label>
      <span className="inline-flex items-center">
        {control}
        {field.required && (
          <span className="text-xs font-semibold text-rose-600" aria-hidden>
            *
          </span>
        )}
      </span>
      {error && (
        <span
          id={`${id}-error`}
          className="mx-1 max-w-[34ch] text-xs text-rose-700"
        >
          {error}
        </span>
      )}
    </span>
  );
}

type FormMarkdownContextValue = {
  item: FormBackedWorkspaceItem;
  values: Record<string, FormValue>;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (fieldId: string, value: string) => void;
  register: (
    fieldId: string,
    node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  ) => void;
};

const FormMarkdownContext = createContext<FormMarkdownContextValue | null>(
  null
);

function FormMarkdownField({ field }: { field: FormFieldDefinition }) {
  const context = useContext(FormMarkdownContext);
  if (!context) return null;

  return (
    <FormFieldControl
      field={field}
      value={context.values[field.id]}
      error={context.errors[field.id]}
      disabled={context.disabled}
      onChange={(value) => context.onChange(field.id, value)}
      inputRef={(node) => context.register(field.id, node)}
    />
  );
}

function FormMarkdownAnchor({ href, children }: React.ComponentProps<"a">) {
  const context = useContext(FormMarkdownContext);
  const fieldId = href?.match(/^#form-field-([a-z][a-z0-9_-]*)$/)?.[1];
  const field = fieldId
    ? context?.item.templateSnapshot.fields[fieldId]
    : undefined;

  if (!context || !field || !fieldId) {
    return <a href={href}>{children}</a>;
  }

  return <FormMarkdownField field={field} />;
}

// Keep these component identities stable. Recreating the `a` renderer on each
// keystroke makes react-markdown remount the input, which drops its focus.
const FORM_MARKDOWN_COMPONENTS: Components = {
  a: FormMarkdownAnchor,
  h1: ({ children }) => (
    <h1 className="mb-5 text-3xl font-bold text-slate-900">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-4 mt-7 text-2xl font-semibold text-slate-900">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-3 mt-6 text-xl font-semibold text-slate-900">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-4 leading-7 text-slate-700">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 list-disc space-y-1 pl-6 text-slate-700">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-decimal space-y-1 pl-6 text-slate-700">
      {children}
    </ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
};

export function FormMarkdown({
  item,
  values,
  errors,
  disabled,
  onChange,
  register,
}: {
  item: FormBackedWorkspaceItem;
  values: Record<string, FormValue>;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (fieldId: string, value: string) => void;
  register: (
    fieldId: string,
    node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  ) => void;
}) {
  return (
    <FormMarkdownContext.Provider
      value={{ item, values, errors, disabled, onChange, register }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={FORM_MARKDOWN_COMPONENTS}
      >
        {markFormPlaceholders(item.templateSnapshot.layoutMarkdown)}
      </ReactMarkdown>
    </FormMarkdownContext.Provider>
  );
}

export function FormWorkspaceCanvas({
  item,
}: {
  item: FormBackedWorkspaceItem;
}) {
  const { refresh } = useWorkspaceItem();
  const { graphData } = useGraphContext();
  const { threadId, setThreadId, getThread } = useThreadContext();
  const { selectedAssistant } = useAssistantContext();
  const router = useRouter();
  const { toast } = useToast();
  const [currentItem, setCurrentItem] = useState(item);
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    Object.fromEntries(
      Object.entries(item.templateSnapshot.fields).map(([id, field]) => [
        id,
        item.submission?.values[id] ?? defaultValue(field),
      ])
    )
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareByok, setShareByok] = useState(false);
  const [byokSettings, setByokSettings] = useState<ByokDialogSettings | null>(
    null
  );
  const [byokLoading, setByokLoading] = useState(false);
  const [byokLoadedForItem, setByokLoadedForItem] = useState<string | null>(
    null
  );
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const kickedOffItem = useRef<string | null>(null);
  const lastAppliedUpdate = useRef<object | null>(null);
  const hydratedDraftKey = useRef<string | null>(null);
  const [hydratedDraftKeyState, setHydratedDraftKeyState] = useState<
    string | null
  >(null);
  const fieldRefs = useRef<
    Record<
      string,
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    >
  >({});
  const submitted = currentItem.submission?.status === "submitted";

  useEffect(() => {
    if (
      !confirmOpen ||
      currentItem.kind !== "method" ||
      submitted ||
      byokLoadedForItem === currentItem.id
    ) {
      return;
    }

    const itemId = currentItem.id;
    let cancelled = false;
    setByokLoading(true);
    fetch("/api/byok", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load provider settings");
        return (await response.json()) as {
          settings?: {
            enabled: boolean;
            model?: string;
            share_mode?: ByokShareMode;
            shared_item_ids?: string[];
          } | null;
        };
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.settings) {
          setByokSettings(null);
          setShareByok(false);
          return;
        }
        const settings: ByokDialogSettings = {
          enabled: body.settings.enabled,
          model: body.settings.model ?? "",
          shareMode: body.settings.share_mode ?? "none",
          sharedItemIds: body.settings.shared_item_ids ?? [],
        };
        setByokSettings(settings);
        setShareByok(
          settings.shareMode === "all_assignments" ||
            (settings.shareMode === "specific_items" &&
              settings.sharedItemIds.includes(itemId))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setByokSettings(null);
          setShareByok(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setByokLoading(false);
          setByokLoadedForItem(itemId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [byokLoadedForItem, confirmOpen, currentItem, submitted]);

  const getStreamInput = useCallback(
    () => ({
      artifact: buildFormArtifact(currentItem, values),
      formContext: buildFormAgentContext(currentItem, values),
    }),
    [currentItem, values]
  );

  useEffect(() => {
    if (currentItem.threadId && !threadId) {
      setThreadId(currentItem.threadId);
    }
  }, [currentItem.threadId, setThreadId, threadId]);

  useEffect(() => {
    if (!threadId || submitted) {
      return;
    }
    const draftKey = `${currentItem.id}:${currentItem.templateSnapshot.templateId}:${threadId}`;
    if (hydratedDraftKey.current === draftKey) {
      return;
    }
    hydratedDraftKey.current = draftKey;

    let cancelled = false;
    void getThread(threadId)
      .then((thread) => {
        if (cancelled) return;
        const threadValues = thread?.values as
          | Record<string, unknown>
          | undefined;
        const draft = threadValues?.formContext as FormAgentContext | undefined;
        if (
          !draft ||
          draft.templateId !== currentItem.templateSnapshot.templateId
        ) {
          return;
        }

        setValues((current) => {
          const next = { ...current };
          for (const [fieldId, value] of Object.entries(draft.values)) {
            if (!(fieldId in currentItem.templateSnapshot.fields)) continue;
            const currentValue = current[fieldId];
            const currentIsEmpty = Array.isArray(currentValue)
              ? currentValue.length === 0
              : currentValue === "" || currentValue === undefined;
            if (currentIsEmpty) next[fieldId] = value;
          }
          return next;
        });
      })
      .catch((error) => {
        console.warn("Could not hydrate the form draft", error);
      })
      .finally(() => {
        if (!cancelled) setHydratedDraftKeyState(draftKey);
      });

    return () => {
      cancelled = true;
    };
    // Draft hydration is intentionally keyed by the active thread id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentItem.id,
    currentItem.templateSnapshot.templateId,
    submitted,
    threadId,
  ]);

  useEffect(() => {
    if (
      threadId &&
      !submitted &&
      hydratedDraftKeyState !==
        `${currentItem.id}:${currentItem.templateSnapshot.templateId}:${threadId}`
    ) {
      return;
    }
    graphData.setChatStarted(true);
    graphData.setArtifact(buildFormArtifact(currentItem, values));
    graphData.setFormContext(buildFormAgentContext(currentItem, values));
  }, [
    currentItem,
    graphData.setArtifact,
    graphData.setChatStarted,
    graphData.setFormContext,
    hydratedDraftKeyState,
    submitted,
    threadId,
    values,
  ]);

  useEffect(() => {
    if (
      kickedOffItem.current === currentItem.id ||
      threadId ||
      !selectedAssistant ||
      graphData.isStreaming ||
      graphData.messages.length > 0
    ) {
      return;
    }

    kickedOffItem.current = currentItem.id;
    const kickoff = new HumanMessage({
      id: `form-kickoff-${currentItem.id}`,
      content:
        "Open this Form Template, understand its schema and current values, and welcome the user. Do not change any fields unless the user asks.",
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
        console.error("Form workspace kickoff failed", error);
      });
  }, [currentItem, getStreamInput, graphData, selectedAssistant, threadId]);

  useEffect(() => {
    if (graphData.isStreaming || !graphData.messages.length) return;
    const result = findLatestFormUpdate(
      graphData.messages,
      currentItem.templateSnapshot.fields
    );
    if (!result) return;
    const { message: assistantMessage, parsed } = result;
    if (lastAppliedUpdate.current === assistantMessage) return;

    lastAppliedUpdate.current = assistantMessage;
    setValues((current) => ({ ...current, ...parsed.updates }));
    const cleanContent = parsed.cleanContent.trim() || "Updated the form.";
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
  }, [
    currentItem.templateSnapshot.fields,
    graphData.isStreaming,
    graphData.messages,
    graphData.setMessages,
  ]);

  const updateValue = useCallback((fieldId: string, value: string) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }, []);

  const registerField = useCallback(
    (
      fieldId: string,
      node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    ) => {
      fieldRefs.current[fieldId] = node;
    },
    []
  );

  async function revokeByokShare(itemId: string, sharedItemIds: string[]) {
    const remainingItemIds = [
      ...new Set(
        sharedItemIds
          .map((sharedItemId) => sharedItemId.trim())
          .filter((sharedItemId) => sharedItemId && sharedItemId !== itemId)
      ),
    ];
    const shareMode = remainingItemIds.length > 0 ? "specific_items" : "none";
    try {
      const response = await fetch("/api/byok", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          share_mode: shareMode,
          shareItemIdsReplace: remainingItemIds,
        }),
      });
      if (!response.ok) {
        throw new Error("Could not revoke BYOK assignment share");
      }
    } catch (error) {
      console.error(
        "[workspace] failed to revoke BYOK assignment share",
        error
      );
    }
  }

  async function submit() {
    setIsSubmitting(true);
    try {
      const shouldRevokeByok =
        currentItem.kind === "method" &&
        !shareByok &&
        byokSettings?.shareMode === "specific_items" &&
        byokSettings.sharedItemIds.includes(currentItem.id);
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            values,
            ...(currentItem.kind === "method" ? { shareByok } : {}),
          }),
        }
      );
      const body = (await response.json()) as {
        item?: FormBackedWorkspaceItem;
        issues?: { fieldId: string; message: string }[];
        error?: string;
      };
      if (!response.ok || !body.item) {
        const nextErrors = Object.fromEntries(
          (body.issues || []).map((issue) => [issue.fieldId, issue.message])
        );
        setErrors(nextErrors);
        const firstInvalid = Object.keys(item.templateSnapshot.fields).find(
          (fieldId) => nextErrors[fieldId]
        );
        if (firstInvalid) {
          fieldRefs.current[firstInvalid]?.focus();
          fieldRefs.current[firstInvalid]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
        throw new Error(body.error || "Please correct the highlighted fields.");
      }
      setCurrentItem(body.item);
      setValues(body.item.submission?.values || values);
      setErrors({});
      setConfirmOpen(false);
      if (shouldRevokeByok && byokSettings) {
        void revokeByokShare(currentItem.id, byokSettings.sharedItemIds);
      }
      await refresh();
    } catch (error) {
      toast({
        title: "Submission failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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

  return (
    <div className="flex h-screen min-h-0 flex-col bg-white">
      <WorkspaceItemBanner
        item={currentItem}
        onAbandon={() => setAbandonOpen(true)}
        onSubmit={() => setConfirmOpen(true)}
        submitDisabled={submitted || isSubmitting}
        submitted={submitted}
        submitLabel={
          currentItem.kind === "method" ? "Start assignment" : undefined
        }
      />
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {!chatCollapsed && (
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={50}
            className="min-h-0 bg-gray-50/70 shadow-inner-right"
            id="form-chat-panel"
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
          minSize={50}
          maxSize={85}
          className="min-w-0 bg-white"
          id="form-editor-panel"
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
                  {workspaceItemTitle(currentItem)}
                </span>
              </div>
              {submitted && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Submitted
                </span>
              )}
            </div>
            <main className="min-h-0 flex-1 overflow-y-auto bg-white">
              <div className="mx-auto max-w-4xl px-5 py-8 sm:px-10">
                <div className="prose prose-slate max-w-none">
                  <FormMarkdown
                    item={currentItem}
                    values={values}
                    errors={errors}
                    disabled={submitted}
                    onChange={updateValue}
                    register={registerField}
                  />
                </div>
                {submitted && currentItem.submission && (
                  <section
                    className="mt-10 border-t border-slate-200 pt-6"
                    aria-label="Submitted content"
                  >
                    <div
                      className="prose prose-slate max-w-none"
                      data-testid="resolved-form-markdown"
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {currentItem.submission.resolvedMarkdown}
                      </ReactMarkdown>
                    </div>
                  </section>
                )}
              </div>
            </main>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Dialog
        open={confirmOpen}
        onOpenChange={(nextOpen) => {
          setConfirmOpen(nextOpen);
          if (!nextOpen) {
            setShareByok(false);
            setByokSettings(null);
            setByokLoading(false);
            setByokLoadedForItem(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentItem.kind === "method"
                ? "Start this assignment?"
                : "Submit and lock this form?"}
            </DialogTitle>
            <DialogDescription>
              {currentItem.kind === "method"
                ? "This launches the assignment for the listed recipients. The published method is frozen for this run."
                : "Submission validates the fields and permanently locks this form. You can still view the resolved Markdown afterwards."}
            </DialogDescription>
          </DialogHeader>
          {currentItem.kind === "method" && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Method:</span>{" "}
                {currentItem.methodSource.title || currentItem.methodSource.id}
              </p>
              <p>
                <a
                  href={publicMethodPageUrl(currentItem.methodSource.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Read the method
                </a>
              </p>
              <MethodByokShareControl
                settings={byokSettings}
                loading={byokLoading}
                checked={shareByok}
                onCheckedChange={setShareByok}
              />
              <p className="font-medium">Recipients</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {Array.from(
                  new Set(
                    (Array.isArray(values.participants)
                      ? values.participants
                      : String(values.participants || "").split(/[;,\n]/)
                    )
                      .map((email) => String(email).trim().toLowerCase())
                      .filter(Boolean)
                  )
                ).map((email) => (
                  <li key={String(email)}>{String(email)}</li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isSubmitting}
            >
              Continue editing
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={isSubmitting}
              data-testid="confirm-form-submit"
            >
              {isSubmitting
                ? currentItem.kind === "method"
                  ? "Starting…"
                  : "Submitting…"
                : currentItem.kind === "method"
                  ? "Start assignment"
                  : "Submit and lock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WorkspaceItemDeleteDialog
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        onConfirm={() => void abandonItem()}
        itemTitle={workspaceItemTitle(currentItem)}
        isDeleting={isAbandoning}
        confirmLabel="Abandon"
      />
    </div>
  );
}
