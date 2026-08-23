import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  appendCloseoutSurvey,
  readCloseoutSurveys,
} from "./closeout-survey-store";

describe("closeout-survey-store", () => {
  let tempDir: string;
  let previousPath: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "closeout-survey-"));
    previousPath = process.env.TEACHING_CLOSEOUT_SURVEY_PATH;
    process.env.TEACHING_CLOSEOUT_SURVEY_PATH = join(
      tempDir,
      "closeout-surveys.jsonl"
    );
  });

  afterEach(async () => {
    if (previousPath === undefined) {
      delete process.env.TEACHING_CLOSEOUT_SURVEY_PATH;
    } else {
      process.env.TEACHING_CLOSEOUT_SURVEY_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes and reads a survey record", async () => {
    const record = await appendCloseoutSurvey({
      assignmentId: "a1",
      teacherId: "t1",
      timestamp: "2026-08-03T12:00:00.000Z",
      usefulness: 4,
      wouldPayForPremium: 3,
      freeText: "Useful for EAP",
    });

    expect(record.assignmentId).toBe("a1");
    const all = await readCloseoutSurveys();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(record);
  });
});
