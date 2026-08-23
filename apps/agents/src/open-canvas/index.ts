import { Command, END, Send, START, StateGraph } from "@langchain/langgraph";
import { DEFAULT_INPUTS } from "@opencanvas/shared/constants";
import { customAction } from "./nodes/customAction.js";
import { generateArtifact } from "./nodes/generate-artifact/index.js";
import { generateFollowup } from "./nodes/generateFollowup.js";
import { generatePath } from "./nodes/generate-path/index.js";
import { reflectNode } from "./nodes/reflect.js";
import { rewriteArtifact } from "./nodes/rewrite-artifact/index.js";
import { rewriteArtifactTheme } from "./nodes/rewriteArtifactTheme.js";
import { updateArtifact } from "./nodes/updateArtifact.js";
import { replyToGeneralInput } from "./nodes/replyToGeneralInput.js";
import { assessThesis } from "./nodes/assess-thesis/index.js";
import { rewriteCodeArtifactTheme } from "./nodes/rewriteCodeArtifactTheme.js";
import { generateTitleNode } from "./nodes/generateTitle.js";
import { updateHighlightedText } from "./nodes/updateHighlightedText.js";
import { applyTextEdits } from "./nodes/applyTextEdits.js";
import { integrateCanvasDirection } from "./nodes/integrate-canvas-direction/index.js";
import { OpenCanvasGraphAnnotation } from "./state.js";
import { summarizer } from "./nodes/summarizer.js";
import { graph as webSearchGraph } from "../web-search/index.js";
import { createAIMessageFromWebResults } from "../utils.js";
import { noAiAssignment } from "./nodes/noAiAssignment.js";

const routeNode = (state: typeof OpenCanvasGraphAnnotation.State) => {
  if (!state.next) {
    throw new Error("'next' state field not set.");
  }

  // A snapshot is a sealed read-only record. Even if an untrusted client
  // supplies a canvas action, always route it to the conversational reply.
  const next = state.ledgerSnapshotContext ? "replyToGeneralInput" : state.next;
  return new Send(next, {
    ...state,
  });
};

export const cleanState = (state: typeof OpenCanvasGraphAnnotation.State) => {
  return {
    ...DEFAULT_INPUTS,
    // Form context is durable conversation state for Form workspaces. The
    // generic defaults intentionally clear per-turn routing inputs, but must
    // not erase the structured values after the assistant has replied.
    formContext: state.formContext,
    // Snapshot context is derived from the immutable workspace item at boot;
    // never retain it in a LangGraph thread checkpoint.
    ledgerSnapshotContext: undefined,
  };
};

export const routeAfterGeneralReply = (
  state: typeof OpenCanvasGraphAnnotation.State
): "cleanState" | "assessThesis" => {
  if (state.apparatusConfiguration?.ai_assistance === false) {
    return "cleanState";
  }

  // Form conversations are not teaching sessions. They should finish after
  // the conversational reply instead of entering the thesis gatekeeper.
  if (state.formContext || state.ledgerSnapshotContext) return "cleanState";

  const phase =
    state.phase_state ||
    (state.apparatusConfiguration &&
    state.apparatusConfiguration.drafting_gate !== undefined &&
    state.apparatusConfiguration.drafting_gate !== "none"
      ? "socratic"
      : "drafting");
  return phase === "socratic" && !state.thesis?.passed
    ? "assessThesis"
    : "cleanState";
};

// ~ 4 chars per token, max tokens of 75000. 75000 * 4 = 300000
const CHARACTER_MAX = 300000;

function simpleTokenCalculator(
  state: typeof OpenCanvasGraphAnnotation.State
): "summarizer" | typeof END {
  const totalChars = state._messages.reduce((acc, msg) => {
    if (typeof msg.content !== "string") {
      const allContent = msg.content.flatMap((c) =>
        "text" in c ? (c.text as string) : []
      );
      const totalChars = allContent.reduce((acc, c) => acc + c.length, 0);
      return acc + totalChars;
    }
    return acc + msg.content.length;
  }, 0);

  if (totalChars > CHARACTER_MAX) {
    return "summarizer";
  }
  return END;
}

/**
 * Conditionally route to the "generateTitle" node if there are only
 * two messages in the conversation. This node generates a concise title
 * for the conversation which is displayed in the thread history.
 */
const conditionallyGenerateTitle = (
  state: typeof OpenCanvasGraphAnnotation.State
): "generateTitle" | "summarizer" | typeof END => {
  if (state.messages.length > 2) {
    // Do not generate if there are more than two messages (meaning it's not the first human-AI conversation)
    return simpleTokenCalculator(state);
  }
  return "generateTitle";
};

/**
 * Updates state & routes the graph based on whether or not the web search
 * graph returned any results.
 */
function routePostWebSearch(
  state: typeof OpenCanvasGraphAnnotation.State
): Send | Command {
  // If there is more than one artifact, then route to the "rewriteArtifact" node. Otherwise, generate the artifact.
  const includesArtifacts = state.artifact?.contents?.length > 1;
  if (!state.webSearchResults?.length) {
    return new Send(
      includesArtifacts ? "rewriteArtifact" : "generateArtifact",
      {
        ...state,
        webSearchEnabled: false,
      }
    );
  }

  // This message is used as a way to reference the web search results in future chats.
  const webSearchResultsMessage = createAIMessageFromWebResults(
    state.webSearchResults
  );

  return new Command({
    goto: includesArtifacts ? "rewriteArtifact" : "generateArtifact",
    update: {
      webSearchEnabled: false,
      messages: [webSearchResultsMessage],
      _messages: [webSearchResultsMessage],
    },
  });
}

const builder = new StateGraph(OpenCanvasGraphAnnotation)
  // Start node & edge
  .addNode("generatePath", generatePath)
  .addEdge(START, "generatePath")
  // Nodes
  .addNode("replyToGeneralInput", replyToGeneralInput)
  .addNode("noAiAssignment", noAiAssignment)
  .addNode("assessThesis", assessThesis)
  .addNode("rewriteArtifact", rewriteArtifact)
  .addNode("rewriteArtifactTheme", rewriteArtifactTheme)
  .addNode("rewriteCodeArtifactTheme", rewriteCodeArtifactTheme)
  .addNode("updateArtifact", updateArtifact)
  .addNode("updateHighlightedText", updateHighlightedText)
  .addNode("applyTextEdits", applyTextEdits)
  .addNode("integrateCanvasDirection", integrateCanvasDirection)
  .addNode("generateArtifact", generateArtifact)
  .addNode("customAction", customAction)
  .addNode("generateFollowup", generateFollowup)
  .addNode("cleanState", cleanState)
  .addNode("reflect", reflectNode)
  .addNode("generateTitle", generateTitleNode)
  .addNode("summarizer", summarizer)
  .addNode("webSearch", webSearchGraph)
  .addNode("routePostWebSearch", routePostWebSearch)
  // Initial router
  .addConditionalEdges("generatePath", routeNode, [
    "updateArtifact",
    "rewriteArtifactTheme",
    "rewriteCodeArtifactTheme",
    "replyToGeneralInput",
    "generateArtifact",
    "rewriteArtifact",
    "customAction",
    "updateHighlightedText",
    "applyTextEdits",
    "integrateCanvasDirection",
    "webSearch",
    "noAiAssignment",
  ])
  // Edges
  // Route generateArtifact through assessThesis to check for phase transitions
  .addEdge("generateArtifact", "assessThesis")
  .addEdge("updateArtifact", "generateFollowup")
  .addEdge("updateHighlightedText", "generateFollowup")
  .addEdge("applyTextEdits", "generateFollowup")
  .addEdge("integrateCanvasDirection", "generateFollowup")
  .addEdge("rewriteArtifact", "generateFollowup")
  .addEdge("rewriteArtifactTheme", "generateFollowup")
  .addEdge("rewriteCodeArtifactTheme", "generateFollowup")
  .addEdge("customAction", "generateFollowup")
  .addEdge("webSearch", "routePostWebSearch")
  .addEdge("noAiAssignment", END)
  // End edges — assess thesis only in socratic phase; otherwise go straight to cleanState
  .addConditionalEdges("replyToGeneralInput", routeAfterGeneralReply, [
    "assessThesis",
    "cleanState",
  ])
  // Route assessThesis to generateFollowup if there's an artifact with content, otherwise cleanState.
  // In socratic phase, skip generateFollowup — no canvas changes happened, so the
  // followup message would be a redundant duplicate of replyToGeneralInput's response.
  .addConditionalEdges(
    "assessThesis",
    (state) => {
      if (state.phase_state === "socratic" || !state.phase_state) {
        return "cleanState";
      }
      const hasContent = state.artifact?.contents?.some(
        (c) => c.type === "text" && (c as any).fullMarkdown?.trim()
      );
      return hasContent ? "generateFollowup" : "cleanState";
    },
    ["generateFollowup", "cleanState"]
  )
  // Only reflect if an artifact was generated/updated.
  .addEdge("generateFollowup", "reflect")
  .addEdge("reflect", "cleanState")
  .addConditionalEdges("cleanState", conditionallyGenerateTitle, [
    END,
    "generateTitle",
    "summarizer",
  ])
  .addEdge("generateTitle", END)
  .addEdge("summarizer", END);

export const graph = builder.compile().withConfig({ runName: "open_canvas" });
