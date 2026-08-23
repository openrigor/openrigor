import { beforeEach, describe, expect, it, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { createMockState } from "../__test-helpers__/mock-config.js";

const harness = vi.hoisted(() => ({
  threadsCreate: vi.fn(),
  runsCreate: vi.fn(),
}));

vi.mock("@langchain/langgraph-sdk", () => ({
  Client: class {
    threads = { create: harness.threadsCreate };
    runs = { create: harness.runsCreate };
  },
}));

import { reflectNode } from "./reflect.js";

describe("reflectNode", () => {
  beforeEach(() => {
    harness.threadsCreate.mockReset();
    harness.runsCreate.mockReset();
    harness.threadsCreate.mockResolvedValue({ thread_id: "reflection-thread" });
    harness.runsCreate.mockResolvedValue({ run_id: "run-1" });
  });

  it("forwards supabase_user_id into the reflection run config", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "hello", id: "m1" })],
    });

    await reflectNode(state, {
      configurable: {
        assistant_id: "asst-1",
        supabase_user_id: "user-1",
      },
    });

    expect(harness.runsCreate).toHaveBeenCalledWith(
      "reflection-thread",
      "reflection",
      expect.objectContaining({
        config: {
          configurable: {
            open_canvas_assistant_id: "asst-1",
            supabase_user_id: "user-1",
          },
        },
      })
    );
  });
});
