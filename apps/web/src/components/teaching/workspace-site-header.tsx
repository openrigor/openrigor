import { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { BRAND_PANEL_COLOR } from "@/components/auth/login/login-branding";

/** Ghost nav control on brand-blue header (docs `.main-nav a`). */
export const workspaceNavGhostClass = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "gap-1.5 text-[#F08080] hover:bg-white/10 hover:text-[#f6a5a5]"
);

/** Outline control on brand-blue header (docs `.nav-cta`). */
export const workspaceNavOutlineClass =
  "border-white/35 bg-transparent text-white hover:bg-white/12 hover:text-white";

/**
 * Top chrome matching knowledge.evaluchat.org `.site-header`: brand panel blue,
 * logo mark + wordmark, light border, subtle atmosphere wash.
 */
export function WorkspaceSiteHeader({
  workspaceLabel,
  children,
  maxWidthClass = "max-w-5xl",
}: {
  workspaceLabel: string;
  children?: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <header
      className="relative sticky top-0 z-50 overflow-hidden border-b border-white/[0.08] text-white"
      style={{ backgroundColor: BRAND_PANEL_COLOR }}
      data-testid="workspace-site-header"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 85% 20%, rgba(255,255,255,0.07), transparent 55%)",
        }}
      />
      <div
        className={cn(
          "relative container mx-auto flex h-[60px] items-center justify-between gap-4 px-6",
          maxWidthClass
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="inline-flex shrink-0 items-center gap-[0.55rem]">
            <Image
              src="/evaluchat.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-[7px] shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
            />
            <span className="text-[1.35rem] font-semibold tracking-tight">
              evaluchat
            </span>
          </div>
          <span className="truncate text-sm font-medium text-white/78">
            {workspaceLabel}
          </span>
        </div>
        <nav className="flex flex-wrap items-center justify-end gap-2">
          {children}
        </nav>
      </div>
    </header>
  );
}
