export interface CsvImportResult {
  emails: string[];
  matched: { email: string; studentId: string }[];
  unmatched: string[];
}

/**
 * Parse a CSV file with an "email" column and match against known students.
 * Accepts a File object (browser File API).
 *
 * Supported column names (case-insensitive): email, e-mail, email address, student email
 *
 * Returns matched student IDs and list of unmatched emails.
 */
export async function parseStudentCsv(
  file: File,
  knownStudents: { id: string; email: string }[]
): Promise<CsvImportResult> {
  const content = await file.text();
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Parse headers
  const headers = lines[0]
    .split(",")
    .map((header) => header.trim().toLowerCase());

  // Find email column
  const emailColumnNames = [
    "email",
    "e-mail",
    "email address",
    "student email",
  ];
  const emailColumnIndex = headers.findIndex((header) =>
    emailColumnNames.some((name) => header === name)
  );

  if (emailColumnIndex === -1) {
    throw new Error("CSV must have an 'email' column");
  }

  // Create lookup map for known students (case-insensitive)
  const studentLookup = new Map<string, string>();
  knownStudents.forEach((student) => {
    studentLookup.set(student.email.toLowerCase().trim(), student.id);
  });

  const emails: string[] = [];
  const matched: { email: string; studentId: string }[] = [];
  const unmatched: string[] = [];

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map((cell) => cell.trim());

    if (row.length <= emailColumnIndex) {
      continue; // Skip rows that don't have enough columns
    }

    const email = row[emailColumnIndex].trim().toLowerCase();

    if (!email) {
      continue; // Skip empty emails
    }

    emails.push(email);

    const studentId = studentLookup.get(email);
    if (studentId) {
      matched.push({ email, studentId });
    } else {
      unmatched.push(email);
    }
  }

  return {
    emails,
    matched,
    unmatched,
  };
}

/**
 * Generate a sample CSV template string for download.
 */
export function generateCsvTemplate(): string {
  return "Student Email\nstudent1@example.com\nstudent2@example.com\n";
}
