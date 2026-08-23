"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { workspaceNavGhostClass } from "@/components/teaching/workspace-site-header";

/** Initials for avatar fallback: "Jane Doe" → "JD", else email local-part first letter. */
export function getUserInitials(user: User): string {
  const metadataName =
    (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" &&
      user.user_metadata.name.trim()) ||
    "";

  if (metadataName) {
    const parts = metadataName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? "";
      const last = parts[parts.length - 1]?.[0] ?? "";
      return `${first}${last}`.toUpperCase();
    }
    return (parts[0]?.[0] ?? "").toUpperCase();
  }

  const local = (user.email ?? "").split("@")[0] ?? "";
  return (local[0] ?? "").toUpperCase();
}

function avatarUrl(user: User): string | undefined {
  const identity = user.identities?.[0] as
    | { avatar_url?: string; identity_data?: { avatar_url?: string } }
    | undefined;
  return identity?.avatar_url ?? identity?.identity_data?.avatar_url;
}

export function UserMenu({ user }: { user: User }) {
  const initials = getUserInitials(user);
  const src = avatarUrl(user);

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={workspaceNavGhostClass}
                data-testid="user-menu-trigger"
                aria-label="Open user settings"
              >
                <Avatar className="h-7 w-7">
                  {src ? <AvatarImage src={src} alt="" /> : null}
                  <AvatarFallback className="bg-white/20 text-xs text-white">
                    {initials || "?"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Open user settings</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block max-w-[12rem] truncate text-sm font-medium">
              {user.email ?? ""}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href="/workspace/settings">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/auth/signout">
              <LogOut className="h-4 w-4" />
              Sign out
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
