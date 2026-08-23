"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ApparatusProfile = {
  id: string;
  version: string;
  label: string;
  description: string;
  configuration?: Record<string, unknown>;
};

type Apparatus = {
  id: string;
  name: string;
  version: string;
  status: string;
  description: string;
  required_capabilities?: string[];
  profiles?: ApparatusProfile[];
  provenance?: { sources?: Array<{ title?: string; resource?: string }> };
};

type CatalogResponse = {
  methods?: Apparatus[];
  enabled?: string[];
};

export function ApparatusCatalogPanel() {
  const [apparatuses, setApparatuses] = useState<Apparatus[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/methods", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = (await response.json()) as CatalogResponse;
      const apparatuses = Array.isArray(data.methods) ? data.methods : [];
      setApparatuses(apparatuses);
      setEnabled(
        Array.isArray(data.enabled)
          ? data.enabled
          : apparatuses.map((apparatus) => apparatus.id)
      );
    } catch {
      setError("Could not load the apparatus catalog.");
      setApparatuses([]);
      setEnabled([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card data-testid="apparatus-catalog-panel">
      <CardHeader>
        <CardTitle>Research apparatuses</CardTitle>
        <p className="text-sm text-muted-foreground">
          Reviewed, versioned workflows that teachers can choose when creating
          an assignment. Treatment parameters are fixed by the selected profile.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading catalog…</p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : apparatuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reviewed apparatuses are available yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {apparatuses.map((apparatus) => {
              const isEnabled = enabled.includes(apparatus.id);
              return (
                <li key={apparatus.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{apparatus.name}</h3>
                        <span className="text-xs text-muted-foreground">
                          v{apparatus.version} · {apparatus.status}
                        </span>
                        <span
                          data-testid={`apparatus-enabled-${apparatus.id}`}
                          className={
                            isEnabled
                              ? "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                              : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          }
                        >
                          {isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {apparatus.description}
                      </p>
                    </div>
                  </div>
                  {apparatus.profiles?.length ? (
                    <div className="mt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Immutable profiles
                      </p>
                      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {apparatus.profiles.map((profile) => (
                          <li key={profile.id}>
                            <span className="font-medium text-foreground">
                              {profile.label}
                            </span>{" "}
                            · v{profile.version} — {profile.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
