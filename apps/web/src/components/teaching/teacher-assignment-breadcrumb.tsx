"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface TeacherAssignmentBreadcrumbProps {
  assignmentTitle?: string;
  currentLabel: string;
}

export function TeacherAssignmentBreadcrumb({
  assignmentTitle,
  currentLabel,
}: TeacherAssignmentBreadcrumbProps) {
  const t = useTranslations("teaching");
  return (
    <nav
      aria-label="Assignment navigation"
      className="flex items-center gap-1 text-sm text-muted-foreground"
      data-testid="teacher-assignment-breadcrumb"
    >
      <Link
        href="/teacher?section=assignments"
        className="hover:text-foreground hover:underline"
      >
        {t("assignments")}
      </Link>
      {assignmentTitle && (
        <>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <span className="max-w-[28rem] truncate">{assignmentTitle}</span>
        </>
      )}
      <ChevronRight className="h-4 w-4" aria-hidden />
      <span className="font-medium text-foreground">{currentLabel}</span>
    </nav>
  );
}
