import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function SettingsBreadcrumb() {
  return (
    <nav
      aria-label="Settings navigation"
      className="flex items-center gap-1 text-sm text-muted-foreground"
      data-testid="settings-breadcrumb"
    >
      <Link href="/workspace" className="hover:text-foreground hover:underline">
        Workspace
      </Link>
      <ChevronRight className="h-4 w-4" aria-hidden />
      <span className="font-medium text-foreground">Settings</span>
    </nav>
  );
}
