"use client";

import Link from "next/link";
import { assignmentMetaLine } from "@/lib/teaching/sample-assignments";
import type { StudentAssignment } from "@/lib/teaching/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { TighterText } from "@/components/ui/header";
import { cn } from "@/lib/utils";
import { ArrowLeft, ExternalLink, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BRAND_PANEL_COLOR } from "@/components/auth/login/login-branding";

export function AssignmentWorkspaceBanner({
  assignment,
  phaseState,
  onSubmit,
  onAbandon,
  homeHref = "/student",
  homeLabel = "Assignments",
  methodHref,
  methodLabel,
}: {
  assignment: StudentAssignment;
  phaseState?: string;
  onSubmit?: () => void;
  onAbandon?: () => void;
  homeHref?: string;
  homeLabel?: string;
  methodHref?: string;
  methodLabel?: string;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-white/[0.08] text-white"
      style={{ backgroundColor: BRAND_PANEL_COLOR }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 85% 20%, rgba(255,255,255,0.07), transparent 55%)",
        }}
      />
      <div className="relative flex items-center gap-4 max-w-[1600px] mx-auto px-4 py-2">
        {/* Left: evaluchat logo + name + phase badge */}
        <div className="flex shrink-0 items-center gap-2">
          <img
            src="/evaluchat.png"
            alt="evaluchat"
            className="w-7 h-7 object-contain"
          />
          <TighterText className="text-xl">evaluchat</TighterText>
          {phaseState && (
            <Badge
              variant={phaseState === "drafting" ? "outline" : "secondary"}
              className="text-xs bg-white/12 border-white/25 text-white"
              data-testid="phase-badge"
            >
              {phaseState === "drafting"
                ? "✏️ Drafting"
                : phaseState === "submitted"
                  ? "✅ Submitted"
                  : "💬 Discussion"}
            </Badge>
          )}
        </div>

        {/* Center: assignment title + meta */}
        <div className="flex flex-1 min-w-0 justify-center">
          <div className="min-w-0 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70 truncate">
              {[methodLabel, assignmentMetaLine(assignment)]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="truncate text-sm font-medium text-white">
              {assignment.title}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          {methodHref && (
            <a
              href={methodHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open published method: ${methodLabel || "method"}`}
              data-testid="method-spec-link"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "max-w-[16rem] gap-1 border-white/35 bg-transparent text-white hover:bg-white/12 hover:text-white"
              )}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{methodLabel || "Method"}</span>
            </a>
          )}
          <Link
            href={homeHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1 border-white/35 bg-transparent text-white hover:bg-white/12 hover:text-white"
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {homeLabel}
          </Link>
          {phaseState !== "submitted" && onAbandon && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAbandon}
              className="gap-1 text-white/78 hover:bg-white/10 hover:text-[#F08080]"
              data-testid="abandon-assignment-button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Abandon
            </Button>
          )}
          {phaseState !== "submitted" && onSubmit && (
            <Button
              variant="default"
              size="sm"
              onClick={onSubmit}
              className="gap-1 bg-[#F08080] text-white shadow-sm hover:bg-[#f6a5a5]"
              data-testid="submit-assignment-button"
            >
              <Send className="h-3.5 w-3.5" />
              Submit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
