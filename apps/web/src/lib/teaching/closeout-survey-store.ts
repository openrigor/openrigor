import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";

export type CloseoutSurveyRecord = {
  assignmentId: string;
  teacherId: string;
  timestamp: string;
  usefulness: number;
  wouldPayForPremium: number;
  freeText?: string;
};

function resolveFilePath(): string {
  return (
    process.env.TEACHING_CLOSEOUT_SURVEY_PATH?.trim() ||
    join(process.cwd(), "data", "teaching", "closeout-surveys.jsonl")
  );
}

export async function appendCloseoutSurvey(
  record: CloseoutSurveyRecord
): Promise<CloseoutSurveyRecord> {
  const filePath = resolveFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf-8");
  return record;
}

export async function readCloseoutSurveys(): Promise<CloseoutSurveyRecord[]> {
  try {
    const raw = await readFile(resolveFilePath(), "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CloseoutSurveyRecord);
  } catch {
    return [];
  }
}
