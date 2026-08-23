"use client";

import {
  WorkspaceSiteHeader,
  workspaceNavGhostClass,
} from "@/components/teaching/workspace-site-header";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { isResearcher, isTeacher } from "@/lib/teaching/teacher-utils";

type ApparatusDashboardItem = {
  id: string;
  name: string;
  version: string;
  status: string;
  research_questions: string[];
  roles: string[];
  min_platform: string;
  knobs: Record<string, unknown>;
  telemetry: string[];
  description: string;
  catalog_urls?: {
    spec: string;
    evidence: string;
    questions: string[];
  };
  enabled: boolean;
  enabled_source: "env" | "org" | "default";
};

export function ResearcherLanding() {
  const router = useRouter();
  const { user, loading } = useUserContext();
  const [apparatuses, setApparatuses] = useState<ApparatusDashboardItem[]>([]);
  const [apparatusLoading, setApparatusLoading] = useState(true);
  const [apparatusError, setApparatusError] = useState(false);

  const fetchApparatuses = useCallback(async () => {
    setApparatusLoading(true);
    setApparatusError(false);
    try {
      const res = await fetch("/api/methods", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = (await res.json()) as {
        methods?: ApparatusDashboardItem[];
      };
      setApparatuses(
        Array.isArray(data.methods)
          ? data.methods.map((apparatus) => ({
              ...apparatus,
              enabled: apparatus.enabled ?? true,
              enabled_source: apparatus.enabled_source ?? "default",
            }))
          : []
      );
    } catch {
      setApparatusError(true);
      setApparatuses([]);
    } finally {
      setApparatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && !isTeacher(user) && !isResearcher(user)) {
      router.replace("/student");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user && (isTeacher(user) || isResearcher(user))) {
      void fetchApparatuses();
    }
  }, [user, loading, fetchApparatuses]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-muted/30">
        <WorkspaceSiteHeader workspaceLabel="Research tools">
          <Link
            href="/auth/signout"
            className={workspaceNavGhostClass}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </WorkspaceSiteHeader>
        <main className="p-6 text-sm text-muted-foreground">Loading…</main>
      </div>
    );
  }

  if (!isTeacher(user) && !isResearcher(user)) {
    return null;
  }

  const measureRows = [
    ["Closed-book recall", "internal knowledge"],
    ["Unaided production", "independent execution"],
    ["AI-assisted performance", "human + AI capability"],
    ["Error detection", "evaluation"],
    ["Explanation", "understanding"],
    ["Transfer", "applying knowledge elsewhere"],
    ["Argument defence", "justifying decisions"],
    ["Delayed retention", "what remains later"],
  ];

  const comingSoon = [
    "Assessment benchmarks",
    "Open experiments",
    "Public data",
    "Annual report",
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <WorkspaceSiteHeader workspaceLabel="Research tools">
        <Link
          href="/auth/signout"
          className={workspaceNavGhostClass}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Link>
      </WorkspaceSiteHeader>

      <main className="container mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Research tools dashboard
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
            Coming soon. We don&apos;t take a side in the AI-in-education debate
            — we measure what happens. The research pillar will gather
            assessment benchmarks, open experiments, public data and an annual
            report here.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-dashed p-8">
          <h2 className="mb-1 text-lg font-semibold">AI-use experimentalism</h2>
          <p className="text-sm text-muted-foreground">
            The interesting question is never just &quot;did AI raise the
            score?&quot; but &quot;what capabilities did this method develop,
            weaken, or leave unchanged?&quot;
          </p>
        </div>

        <section className="mb-8" data-testid="apparatus-registry-section">
          <h2 className="mb-1 text-lg font-semibold">
            Available research apparatuses
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Research questions instrumented in the Workspace as reproducible,
            configurable apparatuses.
          </p>

          {apparatusLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading apparatuses…
            </p>
          ) : apparatusError ? (
            <p className="text-sm text-muted-foreground">
              Could not load apparatus registry
            </p>
          ) : (
            <ul className="space-y-3">
              {apparatuses.map((item) => {
                const sourceLabel =
                  item.enabled_source === "org"
                    ? " (org)"
                    : item.enabled_source === "default"
                      ? " (default)"
                      : " (env)";
                return (
                  <li
                    key={item.id}
                    className="rounded-lg border px-4 py-3 text-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        v{item.version}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.status}
                      </span>
                      <span
                        data-testid={`apparatus-enabled-${item.id}`}
                        className={
                          item.enabled
                            ? "text-xs text-emerald-600"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {item.enabled ? "Enabled" : "Disabled"}
                        {sourceLabel}
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mb-2 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {item.research_questions.map((q) => (
                        <span
                          key={q}
                          className="rounded bg-muted px-2 py-0.5 text-xs"
                        >
                          {q}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Knobs:{" "}
                      {Object.entries(item.knobs)
                        .map(([k, v]) => `${k}=${String(v)}`)
                        .join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Telemetry: {item.telemetry.join(", ")}
                    </p>
                    {item.catalog_urls ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Catalog:{" "}
                        <a
                          href={item.catalog_urls.spec}
                          className="underline hover:text-foreground"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Apparatus spec ↗
                        </a>
                        {" · "}
                        <a
                          href={item.catalog_urls.evidence}
                          className="underline hover:text-foreground"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Evidence ↗
                        </a>
                        {item.catalog_urls.questions[0] ? (
                          <>
                            {" · "}
                            <a
                              href={item.catalog_urls.questions[0]}
                              className="underline hover:text-foreground"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Research question ↗
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            What we measure — not just test scores
          </h2>
          <div className="overflow-hidden rounded-lg border">
            {measureRows.map(([b, s]) => (
              <div
                key={b}
                className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="font-medium">{b}</span>
                <span className="text-muted-foreground">{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Future research tools</h2>
          <ul className="space-y-2">
            {comingSoon.map((item) => (
              <li
                key={item}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm"
              >
                <span>{item}</span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  planned
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
