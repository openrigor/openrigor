"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_PANEL_COLOR } from "@/components/auth/login/login-branding";
import type { WorkspaceItem } from "@/lib/workspace/types";
import { workspaceItemTitle } from "@/lib/workspace/display";
import { publicMethodPageUrl } from "@/lib/workspace/method-links";

function methodSpecHref(item: WorkspaceItem): string | undefined {
  if (item.kind !== "method" && item.kind !== "method_participant") {
    return undefined;
  }
  return publicMethodPageUrl(item.methodSource.id);
}

export function WorkspaceItemBanner({
  item,
  onAbandon,
  onSubmit,
  submitDisabled = false,
  submitted = false,
  submitLabel,
  submitTestId,
  extraActions,
}: {
  item: WorkspaceItem;
  onAbandon: () => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  submitted?: boolean;
  submitLabel?: string;
  submitTestId?: string;
  extraActions?: ReactNode;
}) {
  const methodHref = methodSpecHref(item);
  const methodLabel =
    item.kind === "method" || item.kind === "method_participant"
      ? item.methodSource.title || item.methodSource.id
      : undefined;

  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-white/[0.08] text-white"
      style={{ backgroundColor: BRAND_PANEL_COLOR }}
      data-testid="workspace-item-banner"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 85% 20%, rgba(255,255,255,0.07), transparent 55%)",
        }}
      />
      <div className="relative mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <Image
            src="/evaluchat.png"
            alt="evaluchat"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="text-xl font-semibold tracking-tight">
            evaluchat
          </span>
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="min-w-0 text-center">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-white/70">
              <time dateTime={item.createdAt}>
                Received {new Date(item.createdAt).toLocaleString()}
              </time>
            </p>
            <div className="truncate text-sm font-medium text-white">
              {workspaceItemTitle(item)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {methodHref && (
            <a
              href={methodHref}
              target="_blank"
              rel="noopener noreferrer"
              title={methodLabel}
              aria-label={`Open published method: ${methodLabel}`}
              data-testid="method-spec-link"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "max-w-[16rem] gap-1 border-white/35 bg-transparent text-white hover:bg-white/12 hover:text-white"
              )}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{methodLabel}</span>
            </a>
          )}
          {extraActions}
          {onSubmit &&
            item.kind !== "method_participant" &&
            !(item.kind === "method" && item.run) && (
              <Button
                size="sm"
                onClick={onSubmit}
                disabled={submitDisabled}
                className="bg-white text-[#2c3e56] hover:bg-white/90"
                data-testid={submitTestId ?? "workspace-form-banner-submit"}
              >
                {submitted
                  ? "Submitted"
                  : submitLabel ||
                    (item.kind === "method" ? "Start assignment" : "Submit")}
              </Button>
            )}
          <Link
            href="/workspace"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1 border-white/35 bg-transparent text-white hover:bg-white/12 hover:text-white"
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Workspace
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={onAbandon}
            className="gap-1 text-white/78 hover:bg-white/10 hover:text-[#F08080]"
            data-testid="abandon-workspace-item-button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Abandon
          </Button>
        </div>
      </div>
    </div>
  );
}
