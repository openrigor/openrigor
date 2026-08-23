"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TeacherWorkspaceSection,
  visibleTeacherNavItems,
} from "@/lib/teaching/teacher-workspace-nav";

type Props = {
  section: TeacherWorkspaceSection;
  onSectionChange: (section: TeacherWorkspaceSection) => void;
  canInviteTeachers: boolean;
};

export function TeacherWorkspaceNav({
  section,
  onSectionChange,
  canInviteTeachers,
}: Props) {
  const items = visibleTeacherNavItems(canInviteTeachers);
  return (
    <nav
      className="flex h-full w-56 shrink-0 flex-col gap-1 border-r bg-background p-3"
      data-testid="teacher-workspace-nav"
      aria-label="Organisation workspace"
    >
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          if (item.kind === "external" && item.href) {
            return (
              <a
                key={item.id}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                data-testid={`teacher-nav-${item.id}`}
              >
                {item.label}
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </a>
            );
          }

          const selected = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onSectionChange(item.id as TeacherWorkspaceSection)
              }
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm",
                selected
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              aria-current={selected ? "page" : undefined}
              data-testid={`teacher-nav-${item.id}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
