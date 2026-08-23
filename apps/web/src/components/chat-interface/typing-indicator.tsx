"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import type { FC } from "react";

/**
 * Animated typing dots shown while the agent is processing.
 * Uses ThreadPrimitive.If running so it automatically hides
 * once the assistant message starts rendering.
 */
const TypingDots: FC = () => {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400" />
      <span
        className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400"
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400"
        style={{ animationDelay: "0.4s" }}
      />
    </span>
  );
};

/**
 * Typing indicator that appears in the chat thread while the agent
 * is processing. Shows between the user's message and the first
 * assistant response content.
 *
 * Visibility is controlled by @assistant-ui/react ThreadPrimitive.If running:
 * - Appears when the thread is running (streaming in progress)
 * - Disappears when the run completes or is cancelled
 */
export const TypingIndicator: FC = () => {
  return (
    <>
      <style jsx global>{`
        @keyframes typingBounce {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        .typing-dot {
          animation: typingBounce 1.2s ease-in-out infinite;
        }
      `}</style>
      <ThreadPrimitive.If running>
        <div className="flex w-full max-w-2xl py-3">
          <div className="bg-muted rounded-2xl px-4 py-3">
            <TypingDots />
          </div>
        </div>
      </ThreadPrimitive.If>
    </>
  );
};
