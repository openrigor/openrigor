import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import type { ClassStudent, StudentClassData } from "./types";

const DATA_DIR = join(process.cwd(), "data", "teaching");
const CLASSES_PATH = join(DATA_DIR, "classes.json");

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function readClasses(): Promise<StudentClassData[]> {
  try {
    const raw = await readFile(CLASSES_PATH, "utf-8");
    return JSON.parse(raw) as StudentClassData[];
  } catch {
    return [];
  }
}

async function writeClasses(classes: StudentClassData[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CLASSES_PATH, JSON.stringify(classes, null, 2), "utf-8");
}

export async function getClassesByTeacher(
  teacherId: string
): Promise<StudentClassData[]> {
  const classes = await readClasses();
  return classes.filter((entry) => entry.teacherId === teacherId);
}

export async function getClassById(
  classId: string
): Promise<StudentClassData | undefined> {
  const classes = await readClasses();
  return classes.find((entry) => entry.id === classId);
}

export async function createClass(
  name: string,
  teacherId: string
): Promise<StudentClassData> {
  const now = new Date().toISOString();
  const studentClass: StudentClassData = {
    id: `cls_${uuidv4()}`,
    name: name.trim(),
    teacherId,
    students: [],
    createdAt: now,
    updatedAt: now,
  };

  const classes = await readClasses();
  classes.push(studentClass);
  await writeClasses(classes);
  return studentClass;
}

export async function findOrCreateClassByName(
  name: string,
  teacherId: string
): Promise<StudentClassData> {
  const trimmed = name.trim();
  const classes = await readClasses();
  const existing = classes.find(
    (entry) =>
      entry.teacherId === teacherId &&
      entry.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (existing) {
    return existing;
  }

  return createClass(trimmed, teacherId);
}

export async function updateClass(
  classId: string,
  updates: { name?: string; students?: ClassStudent[] }
): Promise<StudentClassData | undefined> {
  const classes = await readClasses();
  const index = classes.findIndex((entry) => entry.id === classId);
  if (index === -1) {
    return undefined;
  }

  const updated: StudentClassData = {
    ...classes[index],
    ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
    ...(updates.students !== undefined ? { students: updates.students } : {}),
    updatedAt: new Date().toISOString(),
  };

  classes[index] = updated;
  await writeClasses(classes);
  return updated;
}

export async function deleteClass(classId: string): Promise<boolean> {
  const classes = await readClasses();
  const filtered = classes.filter((entry) => entry.id !== classId);
  if (filtered.length === classes.length) {
    return false;
  }

  await writeClasses(filtered);
  return true;
}

export async function addInvitedStudentToClass(
  classId: string,
  email: string
): Promise<StudentClassData | undefined> {
  const classes = await readClasses();
  const index = classes.findIndex((entry) => entry.id === classId);
  if (index === -1) {
    return undefined;
  }

  const normalized = normalizeEmail(email);
  const existing = classes[index].students.find(
    (student) => normalizeEmail(student.email) === normalized
  );
  if (existing) {
    return classes[index];
  }

  const now = new Date().toISOString();
  const student: ClassStudent = {
    supabaseUserId: "",
    email: normalized,
    name: "",
    invitedAt: now,
    acceptedAt: null,
  };

  classes[index] = {
    ...classes[index],
    students: [...classes[index].students, student],
    updatedAt: now,
  };

  await writeClasses(classes);
  return classes[index];
}

export async function addExistingStudentToClass(
  classId: string,
  input: { supabaseUserId: string; email: string; name: string }
): Promise<StudentClassData | undefined> {
  const classes = await readClasses();
  const index = classes.findIndex((entry) => entry.id === classId);
  if (index === -1) {
    return undefined;
  }

  const normalized = normalizeEmail(input.email);
  const now = new Date().toISOString();
  const students = classes[index].students.filter(
    (student) =>
      normalizeEmail(student.email) !== normalized &&
      student.supabaseUserId !== input.supabaseUserId
  );

  students.push({
    supabaseUserId: input.supabaseUserId,
    email: normalized,
    name: input.name.trim(),
    invitedAt: now,
    acceptedAt: now,
  });

  classes[index] = {
    ...classes[index],
    students,
    updatedAt: now,
  };

  await writeClasses(classes);
  return classes[index];
}

export async function acceptStudentInClass(
  classId: string,
  input: { supabaseUserId: string; email: string; name: string }
): Promise<StudentClassData | undefined> {
  const classes = await readClasses();
  const index = classes.findIndex((entry) => entry.id === classId);
  if (index === -1) {
    return undefined;
  }

  const normalized = normalizeEmail(input.email);
  const now = new Date().toISOString();
  const students = [...classes[index].students];
  const studentIndex = students.findIndex(
    (student) => normalizeEmail(student.email) === normalized
  );

  const acceptedStudent: ClassStudent = {
    supabaseUserId: input.supabaseUserId,
    email: normalized,
    name: input.name.trim(),
    invitedAt: studentIndex >= 0 ? students[studentIndex].invitedAt : now,
    acceptedAt: now,
  };

  if (studentIndex >= 0) {
    students[studentIndex] = acceptedStudent;
  } else {
    students.push(acceptedStudent);
  }

  classes[index] = {
    ...classes[index],
    students,
    updatedAt: now,
  };

  await writeClasses(classes);
  return classes[index];
}

export async function updateStudentNameInClass(
  classId: string,
  studentId: string,
  name: string
): Promise<StudentClassData | undefined> {
  const classes = await readClasses();
  const index = classes.findIndex((entry) => entry.id === classId);
  if (index === -1) {
    return undefined;
  }

  const normalizedStudentId = studentId.trim().toLowerCase();
  const students = [...classes[index].students];
  const studentIndex = students.findIndex(
    (student) =>
      student.supabaseUserId === studentId ||
      normalizeEmail(student.email) === normalizedStudentId
  );

  if (studentIndex === -1) {
    return undefined;
  }

  students[studentIndex] = {
    ...students[studentIndex],
    name: name.trim(),
  };

  classes[index] = {
    ...classes[index],
    students,
    updatedAt: new Date().toISOString(),
  };

  await writeClasses(classes);
  return classes[index];
}

export async function removeStudentFromClass(
  classId: string,
  studentId: string
): Promise<boolean> {
  const classes = await readClasses();
  const index = classes.findIndex((entry) => entry.id === classId);
  if (index === -1) {
    return false;
  }

  const filtered = classes[index].students.filter(
    (student) =>
      student.supabaseUserId !== studentId &&
      normalizeEmail(student.email) !== normalizeEmail(studentId)
  );

  if (filtered.length === classes[index].students.length) {
    return false;
  }

  classes[index] = {
    ...classes[index],
    students: filtered,
    updatedAt: new Date().toISOString(),
  };

  await writeClasses(classes);
  return true;
}
