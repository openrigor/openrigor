import { vi } from "vitest";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { OpenCanvasGraphAnnotation } from "../state.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Mock model that can be controlled in tests to return specific tool calls
 */
export class MockModel {
  private toolCallResponses: Map<string, any> = new Map();
  private textContent: string = "Mock response";

  constructor() {
    this.invoke = vi.fn().mockImplementation(async (_messages) => {
      // Return an AI message with configured tool calls
      const toolCalls = Array.from(this.toolCallResponses.values());
      return new AIMessage({
        content: this.textContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    });

    this.bindTools = vi.fn().mockImplementation(() => this);
    this.withConfig = vi.fn().mockImplementation(() => this);
  }

  invoke: ReturnType<typeof vi.fn>;
  bindTools: ReturnType<typeof vi.fn>;
  withConfig: ReturnType<typeof vi.fn>;

  /**
   * Configure the mock to return specific tool call results
   */
  setToolCallResponse(toolName: string, args: any) {
    this.toolCallResponses.set(toolName, {
      name: toolName,
      args,
      id: `mock_${toolName}_${Date.now()}`,
    });
  }

  /**
   * Set plain-text response content (used when no tool call is configured).
   */
  setTextContent(content: string) {
    this.textContent = content;
  }

  /**
   * Clear all configured tool call responses
   */
  clearToolCallResponses() {
    this.toolCallResponses.clear();
  }
}

/**
 * Mock LangGraphRunnableConfig with controllable configurable values
 */
export function createMockConfig(
  overrides: {
    customModelName?: string;
    systemPrompt?: string;
    assistant_id?: string;
    store?: any;
    supabase_session?: any;
  } = {}
): LangGraphRunnableConfig {
  return {
    configurable: {
      customModelName: "mock-model",
      assistant_id: "test-assistant-123",
      ...overrides,
    },
    store: overrides.store || null,
  } as LangGraphRunnableConfig;
}

/**
 * Create a minimal graph state with defaults
 */
export function createMockState(
  overrides: Partial<typeof OpenCanvasGraphAnnotation.State> = {}
): typeof OpenCanvasGraphAnnotation.State {
  const defaultMessage = new HumanMessage({
    content: "Test message",
    id: "test-msg-1",
  });

  return {
    messages: [defaultMessage],
    _messages: [defaultMessage],
    highlightedCode: undefined,
    highlightedText: undefined,
    artifact: undefined as any,
    formContext: undefined,
    ledgerContext: undefined,
    ledgerSnapshotContext: undefined,
    next: undefined,
    language: undefined,
    artifactLength: undefined,
    regenerateWithEmojis: undefined,
    readingLevel: undefined,
    addComments: undefined,
    addLogs: undefined,
    portLanguage: undefined,
    fixBugs: undefined,
    customQuickActionId: undefined,
    webSearchEnabled: undefined,
    webSearchResults: undefined,
    phase_state: undefined,
    thesis: undefined,
    apparatusConfiguration: undefined,
    cursorPosition: undefined,
    editorSelectedText: undefined,
    textEditIntent: undefined,
    textEditSummary: undefined,
    ...overrides,
  };
}

/**
 * Create a mock store for tests that need storage functionality
 */
export function createMockStore() {
  const store = new Map<string, any>();

  return {
    get: vi
      .fn()
      .mockImplementation(async (namespace: string[], key: string) => {
        const fullKey = [...namespace, key].join("::");
        const value = store.get(fullKey);
        return value ? { value } : null;
      }),
    put: vi
      .fn()
      .mockImplementation(
        async (namespace: string[], key: string, value: any) => {
          const fullKey = [...namespace, key].join("::");
          store.set(fullKey, value);
        }
      ),
  };
}

/**
 * Mock the utils getModelFromConfig function to return our mock model
 */
export function mockGetModelFromConfig(mockModel: MockModel) {
  return vi.fn().mockResolvedValue(mockModel);
}
