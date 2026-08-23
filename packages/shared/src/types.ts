import type { DocumentInterface } from "@langchain/core/documents";

export * from "./apparatus.js";

export interface ModelConfigurationParams {
  name: string;
  label: string;
  modelName?: string;
  config: CustomModelConfig;
  isNew: boolean;
}

export interface CustomModelConfig {
  provider: string;
  temperatureRange: {
    min: number;
    max: number;
    default: number;
    current: number;
  };
  maxTokens: {
    min: number;
    max: number;
    default: number;
    current: number;
  };
  azureConfig?: {
    azureOpenAIApiKey: string;
    azureOpenAIApiInstanceName: string;
    azureOpenAIApiDeploymentName: string;
    azureOpenAIApiVersion: string;
    azureOpenAIBasePath?: string;
  };
}

export type ArtifactLengthOptions = "shortest" | "short" | "long" | "longest";

export type ArtifactType = "code" | "text";

export interface ArtifactContent {
  index: number;
  content: string;
  title: string;
  type: ArtifactType;
  language: string;
}

export interface Artifact {
  id: string;
  contents: ArtifactContent[];
  currentContentIndex: number;
}

export interface ArtifactToolResponse {
  artifact?: string;
  title?: string;
  language?: string;
  type?: string;
}

export type RewriteArtifactMetaToolResponse =
  | {
      type: "text";
      title?: string;
      language: ProgrammingLanguageOptions;
    }
  | {
      type: "code";
      title: string;
      language: ProgrammingLanguageOptions;
    };

export type LanguageOptions =
  | "english"
  | "mandarin"
  | "spanish"
  | "french"
  | "hindi";

export type ProgrammingLanguageOptions =
  | "typescript"
  | "javascript"
  | "cpp"
  | "java"
  | "php"
  | "python"
  | "html"
  | "sql"
  | "json"
  | "rust"
  | "xml"
  | "clojure"
  | "csharp"
  | "other";

export type ReadingLevelOptions =
  | "pirate"
  | "child"
  | "teenager"
  | "college"
  | "phd";

export interface CodeHighlight {
  startCharIndex: number;
  endCharIndex: number;
}

export interface EditorCursorPosition {
  /** 1-based line number where the cursor is */
  line: number;
  /** 1-based column number */
  column: number;
  /** If the user has text selected, the plain-text content of the selection */
  selectedText?: string;
  /** Total number of lines in the document */
  totalLines: number;
}

export interface ArtifactMarkdownV3 {
  index: number;
  type: "text";
  title: string;
  fullMarkdown: string;
}

export interface ArtifactCodeV3 {
  index: number;
  type: "code";
  title: string;
  language: ProgrammingLanguageOptions;
  code: string;
}

export interface ArtifactV3 {
  currentIndex: number;
  contents: (ArtifactMarkdownV3 | ArtifactCodeV3)[];
}

export interface TextHighlight {
  fullMarkdown: string;
  markdownBlock: string;
  selectedText: string;
}

export interface CustomQuickAction {
  /**
   * A UUID for the quick action. Used to identify the quick action.
   */
  id: string;
  /**
   * The title of the quick action. Used in the UI
   * to display the quick action.
   */
  title: string;
  /**
   * The prompt to use when the quick action is invoked.
   */
  prompt: string;
  /**
   * Whether or not to include the user's reflections in the prompt.
   */
  includeReflections: boolean;
  /**
   * Whether or not to include the default prefix in the prompt.
   */
  includePrefix: boolean;
  /**
   * Whether or not to include the last 5 (or less) messages in the prompt.
   */
  includeRecentHistory: boolean;
}

export interface Reflections {
  /**
   * Style rules to follow for generating content.
   */
  styleRules: string[];
  /**
   * Key content to remember about the user when generating content.
   */
  content: string[];
}

export type ContextDocument = {
  /**
   * The name of the document.
   */
  name: string;
  /**
   * The type of the document.
   */
  type: string;
  /**
   * The base64 encoded content of the document, or plain
   * text value if the type is `text`
   */
  data: string;
  /**
   * Optional metadata about the document.
   */
  metadata?: Record<string, any>;
};

export type FormAgentValue = string | number | string[];

export interface FormAgentContext {
  templateId: string;
  title: string;
  description: string;
  layoutMarkdown: string;
  fields: Record<
    string,
    {
      label: string;
      type: string;
      required: boolean;
    }
  >;
  values: Record<string, FormAgentValue>;
  methodContext?: {
    title: string;
    description?: string;
    guidance?: string;
    briefTemplate?: string;
  };
}

export type LedgerAgentFilter =
  | { control: "multi-select"; values: string[] }
  | { control: "range"; min?: number | string; max?: number | string };

export interface LedgerAgentDimension {
  id: string;
  role: "context" | "collection" | "method";
  control: "multi-select" | "range";
  options?: string[];
  type: "text" | "number" | "date";
}

export interface LedgerAgentContext {
  kind: "ledger";
  methodId: string;
  methodTitle?: string;
  methodVersion: string;
  templateId: string;
  templateVersion: string;
  dimensions: LedgerAgentDimension[];
  filters: Record<string, LedgerAgentFilter>;
  baselineCount?: number;
  scope?: { buckets: Record<string, number>; predicate?: string };
}

/**
 * A compact, read-only view of a sealed Evidence Ledger snapshot for the
 * assistant. The resolver manifest and its contribution rows deliberately do
 * not cross this boundary: callers provide only aggregate distributions and
 * the paths needed to discuss recorded gaps.
 */
export interface LedgerSnapshotAgentContext {
  kind: "ledger_snapshot";
  ledgerId: string;
  parentLedgerItemId: string;
  methodId: string;
  methodTitle?: string;
  methodVersion: string;
  templateId: string;
  templateVersion: string;
  predicate: string;
  sourceCommit: string;
  generatedAt: string;
  buckets: Record<string, number>;
  contributions: {
    included: number;
    perDimension: Record<string, Record<string, number>>;
    gaps: Array<{ path: string; bucket: string }>;
  };
  publication?: { status: string; prUrl?: string };
  truncated?: { applied: boolean; fields: string[] };
}

/**
 * The metadata included in search results from Exa.
 */
export type ExaMetadata = {
  id: string;
  url: string;
  title: string;
  author: string;
  publishedDate: string;
  image?: string;
  favicon?: string;
};

export type SearchResult = DocumentInterface<ExaMetadata>;

export interface GraphInput {
  messages?: Record<string, any>[];

  highlightedCode?: CodeHighlight;
  highlightedText?: TextHighlight;
  cursorPosition?: EditorCursorPosition;

  artifact?: ArtifactV3;

  /** Current structured Form Template context for the assistant. */
  formContext?: FormAgentContext;

  /** Current scoped Evidence Ledger context for the assistant. */
  ledgerContext?: LedgerAgentContext;

  /** Current sealed Evidence Ledger Snapshot context for the assistant. */
  ledgerSnapshotContext?: LedgerSnapshotAgentContext;

  next?: string;

  language?: LanguageOptions;
  artifactLength?: ArtifactLengthOptions;
  regenerateWithEmojis?: boolean;
  readingLevel?: ReadingLevelOptions;

  addComments?: boolean;
  addLogs?: boolean;
  portLanguage?: ProgrammingLanguageOptions;
  fixBugs?: boolean;
  customQuickActionId?: string;

  webSearchEnabled?: boolean;
  webSearchResults?: SearchResult[];

  // Teaching POC
  phase_state?: TeachingPhase;
  thesis?: ThesisAssessment;

  /** Server-resolved immutable apparatus treatment snapshot. */
  apparatusConfiguration?: import("./apparatus.js").ApparatusConfiguration;
}

// --- Text edit types (deterministic canvas edits) ---

export type TextEditIntent =
  | {
      kind: "replace_all";
      find: string;
      replace: string;
      matchCase?: boolean;
    }
  | {
      kind: "replace_in_selection";
      find: string;
      replace: string;
      replaceAllInBlock?: boolean;
    };

export type TextEditSummary =
  | {
      op: "replace_all";
      find: string;
      replace: string;
      matchCount: number;
    }
  | {
      op: "replace_in_selection";
      find: string;
      replace: string;
      matchCount: number;
    }
  | {
      op: "replace_in_selection";
      error: string;
    };

// --- Teaching POC types ---

export type TeachingPhase = "socratic" | "drafting" | "submitted";

export interface ThesisAssessment {
  /** Whether the thesis passed the quality gate */
  passed: boolean;
  /** Brief feedback for the student */
  feedback: string;
  /** The extracted thesis statement, if one was identified */
  thesis?: string;
}
