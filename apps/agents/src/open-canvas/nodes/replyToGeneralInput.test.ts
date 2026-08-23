import { describe, it, expect, vi, beforeEach } from "vitest";
import { replyToGeneralInput } from "./replyToGeneralInput.js";
import { detectHollowInput } from "./hollow-input.js";
import {
  createMockConfig,
  createMockState,
  MockModel,
  createMockStore,
} from "../__test-helpers__/mock-config.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";

// Mock pdf-parse to prevent file system access during testing
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

// Mock the utils module
vi.mock("../../utils.js", () => ({
  getModelFromConfig: vi.fn(),
  ensureStoreInConfig: vi.fn(),
  formatReflections: vi.fn().mockReturnValue("No reflections found."),
  formatArtifactContentWithTemplate: vi.fn().mockReturnValue(""),
  isUsingO1MiniModel: vi.fn().mockReturnValue(false),
  optionallyGetSystemPromptFromConfig: vi.fn(),
  createContextDocumentMessages: vi.fn().mockResolvedValue([]),
}));

describe("detectHollowInput", () => {
  it.each([
    "Participant reply 1",
    "participant REPLY2",
    "reply 5",
    "ok",
    "yes",
    "hi",
    "asdf qwerty 12345",
    "2",
    "",
    "   ",
  ])("flags %j as hollow", (input) => {
    expect(detectHollowInput(input)).toBe(true);
  });

  it.each([
    "Set the title",
    "I think the ending is ironic because...",
    "Can you help me write my intro?",
    "My reply 1 is that Hamlet delays because he overthinks everything.",
    "reply 1 to your question is that I agree",
    "أعتقد أن العنوان ساخر",
    "タイトルは皮肉だ",
    "Creo que el final es irónico",
    "我认为这个标题具有讽刺意味",
  ])("keeps %j as substantive", (input) => {
    expect(detectHollowInput(input)).toBe(false);
  });
});

describe("replyToGeneralInput", () => {
  let mockModel: MockModel;
  let mockStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockModel = new MockModel();
    mockStore = createMockStore();

    // Configure mock responses
    mockModel.invoke.mockResolvedValue(
      new AIMessage({ content: "Mock AI response", id: "ai-response-1" })
    );

    const utils = vi.mocked(await import("../../utils.js"));
    utils.getModelFromConfig.mockResolvedValue(mockModel as any);
    utils.ensureStoreInConfig.mockReturnValue(mockStore);
    utils.optionallyGetSystemPromptFromConfig.mockReturnValue(undefined);
  });

  it("should include socratic phase instructions when phase_state is socratic", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({ content: "Help me with my thesis", id: "1" }),
      ],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    // Check that the model was called with socratic instructions
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Socratic"),
      }),
      ...state._messages,
    ]);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("NEVER blocked from using the canvas"),
      }),
      ...state._messages,
    ]);
  });

  it("should include drafting phase instructions when phase_state is drafting", async () => {
    const state = createMockState({
      phase_state: "drafting",
      _messages: [
        new HumanMessage({ content: "Help me write my introduction", id: "1" }),
      ],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    // Check that the model was called with drafting instructions
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Drafting"),
      }),
      ...state._messages,
    ]);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Collaborative review"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("You are an AI writing coach"),
      }),
      ...state._messages,
    ]);
  });

  it("should include submitted phase instructions when phase_state is submitted", async () => {
    const state = createMockState({
      phase_state: "submitted",
      _messages: [new HumanMessage({ content: "How did I do?", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Submitted"),
      }),
      ...state._messages,
    ]);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("assignment is complete"),
      }),
      ...state._messages,
    ]);
  });

  it("should default to drafting phase in an open workspace", async () => {
    const state = createMockState({
      phase_state: undefined,
      apparatusConfiguration: undefined,
      _messages: [new HumanMessage({ content: "General question", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Drafting"),
      }),
      ...state._messages,
    ]);
  });

  it("should combine assignment system prompt with phase instructions", async () => {
    const assignmentPrompt = "Write a 5-paragraph essay about Romeo and Juliet";
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "I need help", id: "1" })],
    });
    const config = createMockConfig({
      assistant_id: "test-123",
      systemPrompt: assignmentPrompt,
    });

    const utils = vi.mocked(await import("../../utils.js"));
    utils.optionallyGetSystemPromptFromConfig.mockReturnValue(assignmentPrompt);

    await replyToGeneralInput(state, config);

    // Should include both the assignment prompt and phase instructions
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringMatching(
          new RegExp(`${assignmentPrompt}.*Current phase: Socratic`, "s")
        ),
      }),
      ...state._messages,
    ]);
  });

  it("should return the AI response in the correct format", async () => {
    const mockResponse = new AIMessage({
      content: "Here's my coaching response",
      id: "ai-response-123",
    });
    mockModel.invoke.mockResolvedValue(mockResponse);

    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    const result = await replyToGeneralInput(state, config);

    expect(result).toEqual({
      messages: [mockResponse],
      _messages: [mockResponse],
    });
  });

  it("asks for elaboration without invoking the model for hollow input", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [
        {
          type: "human",
          content: "Participant reply 1",
          id: "1",
        } as any,
      ],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    const result = await replyToGeneralInput(state, config);
    const response = result.messages?.[0];
    const responseText = String(response?.content);

    expect(mockModel.invoke).not.toHaveBeenCalled();
    expect(response).toBeInstanceOf(AIMessage);
    expect(responseText).toContain("mind elaborating");
    expect(responseText).not.toMatch(/great choice|started somewhere/i);
  });

  it("asks for elaboration without invoking the model for a human message without content", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [{ type: "human", id: "1" } as any],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    const result = await replyToGeneralInput(state, config);

    expect(mockModel.invoke).not.toHaveBeenCalled();
    expect(String(result.messages?.[0]?.content)).toContain("mind elaborating");
    expect(result._messages).toHaveLength(1);
    expect(String(result._messages?.[0]?.content)).toContain(
      "mind elaborating"
    );
  });

  it("uses the latest visible human message for the hollow-input guard", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "I think Hamlet delays because he overthinks everything.",
          id: "visible-student-message",
        }),
        {
          type: "human",
          content: "Participant reply 2",
          id: "hidden-workspace-message",
          additional_kwargs: { [OC_HIDE_FROM_UI_KEY]: true },
        } as any,
      ],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledOnce();
  });

  it("should retrieve reflections from store", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-assistant-456" });

    // Configure mock store to return reflections
    const mockReflections = {
      styleRules: ["Be concise", "Use active voice"],
      content: ["Student prefers examples", "Struggles with thesis statements"],
    };
    mockStore.get.mockResolvedValue({ value: mockReflections });

    await replyToGeneralInput(state, config);

    // Verify store was accessed with correct parameters
    expect(mockStore.get).toHaveBeenCalledWith(
      ["memories", "anonymous", "test-assistant-456"],
      "reflection"
    );
  });

  it("should handle missing assistant_id in config", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: undefined });

    await expect(replyToGeneralInput(state, config)).rejects.toThrow(
      "`assistant_id` not found in configurable"
    );
  });

  it("should use user role for o1 mini model", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    const utils = vi.mocked(await import("../../utils.js"));
    utils.isUsingO1MiniModel.mockReturnValue(true);

    await replyToGeneralInput(state, config);

    // Should use "user" role instead of "system" for o1-mini
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user", // Not "system"
        content: expect.stringContaining("Current phase: Socratic"),
      }),
      ...state._messages,
    ]);
  });

  it("includes the structured form context and update protocol", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Set the title", id: "1" })],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief for an assignment",
        layoutMarkdown: "# {{title}}",
        fields: {
          title: { label: "Title", type: "text", required: true },
        },
        values: { title: "Old title" },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<form-context>"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining('"title": "Old title"'),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<form-updates>"),
      }),
      ...state._messages,
    ]);
  });

  it("includes declared ledger dimensions and the ledger update protocol", async () => {
    const state = createMockState({
      _messages: [
        new HumanMessage({
          content: "Filter to K-12 evidence",
          id: "1",
        }),
      ],
      ledgerContext: {
        kind: "ledger",
        methodId: "evidence-method",
        methodTitle: "Evidence method",
        methodVersion: "1.0.0",
        templateId: "evidence-template",
        templateVersion: "2.0.0",
        dimensions: [
          {
            id: "education_level",
            role: "context",
            control: "multi-select",
            options: ["k12", "higher_ed"],
            type: "text",
          },
          {
            id: "collection_date",
            role: "collection",
            control: "range",
            type: "date",
          },
        ],
        filters: {
          education_level: { control: "multi-select", values: ["k12"] },
        },
        baselineCount: 12,
        scope: {
          buckets: { Included: 6 },
          predicate: "education_level in [k12]",
        },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<ledger-updates>"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining('"education_level"'),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining('"collection_date"'),
      }),
      ...state._messages,
    ]);
  });

  it("includes only the read-only Ledger Snapshot summary", async () => {
    const state = createMockState({
      _messages: [
        new HumanMessage({
          content: "Summarise the evidence and gaps",
          id: "1",
        }),
      ],
      ledgerSnapshotContext: {
        kind: "ledger_snapshot",
        ledgerId: "ledger_demo",
        parentLedgerItemId: "wi_ledger",
        methodId: "evidence-method",
        methodTitle: "Evidence method",
        methodVersion: "1.0.0",
        templateId: "evidence-template",
        templateVersion: "2.0.0",
        predicate: "education_level in [k12]",
        sourceCommit: "abc123",
        generatedAt: "2026-08-19T12:00:00.000Z",
        buckets: { Included: 6, Unknown: 2, Unavailable: 2 },
        contributions: {
          included: 12,
          perDimension: {
            education_level: { higher_ed: 2, k12: 4 },
          },
          gaps: [{ path: "evidence/missing-study.md", bucket: "Unavailable" }],
        },
        publication: {
          status: "draft",
          prUrl: "https://github.com/evaluchat/research/pull/42",
        },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<ledger-snapshot-context>"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining('"sourceCommit": "abc123"'),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining('"bucket": "Unavailable"'),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("machine-readable update block"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("education_level in [k12]"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("External source detection"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("writing coach"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("<ledger-updates>"),
      }),
      ...state._messages,
    ]);
  });

  it("does not intercept hollow Ledger Snapshot input with essay clarification", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "ok", id: "1" })],
      ledgerSnapshotContext: {
        kind: "ledger_snapshot",
        ledgerId: "ledger_demo",
        parentLedgerItemId: "wi_ledger",
        methodId: "evidence-method",
        methodTitle: "Evidence method",
        methodVersion: "1.0.0",
        templateId: "evidence-template",
        templateVersion: "2.0.0",
        predicate: "education_level in [k12]",
        sourceCommit: "abc123",
        generatedAt: "2026-08-19T12:00:00.000Z",
        buckets: { Included: 6, Unknown: 2, Unavailable: 2 },
        contributions: {
          included: 12,
          perDimension: {
            education_level: { higher_ed: 2, k12: 4 },
          },
          gaps: [{ path: "evidence/missing-study.md", bucket: "Unavailable" }],
        },
        publication: {
          status: "draft",
          prUrl: "https://github.com/evaluchat/research/pull/42",
        },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    const result = await replyToGeneralInput(state, config);

    expect(String(result.messages?.[0]?.content)).not.toContain(
      "I didn't quite catch that"
    );
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<ledger-snapshot-context>"),
      }),
      ...state._messages,
    ]);
  });

  it("uses the Ledger Snapshot context for mixed workspace contexts", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief for an assignment",
        layoutMarkdown: "# {{title}}",
        fields: {
          title: { label: "Title", type: "text", required: true },
        },
        values: { title: "Old title" },
      },
      ledgerContext: {
        kind: "ledger",
        methodId: "evidence-method",
        methodVersion: "1.0.0",
        templateId: "evidence-template",
        templateVersion: "2.0.0",
        dimensions: [],
        filters: {},
      },
      ledgerSnapshotContext: {
        kind: "ledger_snapshot",
        ledgerId: "ledger_demo",
        parentLedgerItemId: "wi_ledger",
        methodId: "evidence-method",
        methodVersion: "1.0.0",
        templateId: "evidence-template",
        templateVersion: "2.0.0",
        predicate: "all accepted evidence",
        sourceCommit: "abc123",
        generatedAt: "2026-08-19T12:00:00.000Z",
        buckets: {},
        contributions: { included: 0, perDimension: {}, gaps: [] },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("<ledger-updates>"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("<form-updates>"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<ledger-snapshot-context>"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("is read-only."),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("all accepted evidence"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining('"included": 0'),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("<ledger-updates>"),
      }),
      ...state._messages,
    ]);
  });

  it("does not add the ledger protocol when no ledger context is set", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("<ledger-updates>"),
      }),
      ...state._messages,
    ]);
  });

  it("orients Method brief chats to the assignment initiator", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Review the brief", id: "1" })],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief for an assignment",
        layoutMarkdown: "# {{title}}",
        fields: {},
        values: {},
        methodContext: {
          title: "AI-assisted essay",
          description: "Constrained dialogic drafting.",
          guidance: "Keep the assignment open to student interpretation.",
          briefTemplate: "# {{title}}",
        },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          "You are assisting the person creating and initiating this assignment"
        ),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          '"guidance": "Keep the assignment open to student interpretation."'
        ),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          "This initiator orientation overrides the generic AI writing coach"
        ),
      }),
      ...state._messages,
    ]);
  });

  it("does not add Method initiator orientation without Method context", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Set the title", id: "1" })],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief for an assignment",
        layoutMarkdown: "# {{title}}",
        fields: {},
        values: {},
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          "You are an AI writing coach helping a student"
        ),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("<method-context>"),
      }),
      ...state._messages,
    ]);
  });
});
