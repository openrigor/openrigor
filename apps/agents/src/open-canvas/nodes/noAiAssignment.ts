import { AIMessage } from "@langchain/core/messages";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";

/** Deterministic response for apparatus profiles with AI assistance disabled. */
export function noAiAssignment(
  _state: typeof OpenCanvasGraphAnnotation.State
): OpenCanvasGraphReturnType {
  const message = new AIMessage({
    content:
      "AI assistance is disabled for this assignment. Continue authoring directly on the canvas and submit when you are ready.",
  });
  return { messages: [message], _messages: [message] };
}
