"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

export type SettingsBreadcrumbSegment = {
  label: string;
  href?: string;
  testId?: string;
};

export function SettingsBreadcrumb({
  trailingSegments = [],
}: {
  trailingSegments?: SettingsBreadcrumbSegment[];
}) {
  const t = useTranslations("workspace");
  return (
    <nav
      aria-label="Settings navigation"
      className="flex items-center gap-1 text-sm text-muted-foreground"
      data-testid="settings-breadcrumb"
    >
      <Link href="/workspace" className="hover:text-foreground hover:underline">
        {t("workspace")}
      </Link>
      <ChevronRight className="h-4 w-4" aria-hidden />
      {trailingSegments.length > 0 ? (
        <Link
          href="/workspace/settings"
          className="hover:text-foreground hover:underline"
        >
          {t("settings")}
        </Link>
      ) : (
        <span className="font-medium text-foreground">{t("settings")}</span>
      )}
      {trailingSegments.map((segment, index) => (
        <span key={`${segment.label}:${index}`} className="contents">
          <ChevronRight className="h-4 w-4" aria-hidden />
          {segment.href ? (
            <Link
              href={segment.href}
              className="hover:text-foreground hover:underline"
              data-testid={segment.testId}
            >
              {segment.label}
            </Link>
          ) : (
            <span
              className="font-medium text-foreground"
              data-testid={segment.testId}
            >
              {segment.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
