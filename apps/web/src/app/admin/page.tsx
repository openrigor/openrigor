import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import { isAdminDashboardEnabled, isPlatformAdmin } from "@/lib/admin/guard";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Unknown date";
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function RankedList({
  title,
  rows,
  countLabel,
}: {
  title: string;
  rows: Array<{ email: string; count: number }>;
  countLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((row, index) => (
              <li
                className="flex items-center justify-between gap-4 text-sm"
                key={`${row.email}-${index}`}
              >
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-muted-foreground">
                    {index + 1}.
                  </span>
                  {row.email}
                </span>
                <span className="shrink-0 font-medium">
                  {row.count} {countLabel}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminPage() {
  if (!isAdminDashboardEnabled()) notFound();

  let auth;
  try {
    auth = await verifyUserAuthenticated();
  } catch (error) {
    console.error("Failed to authenticate admin page request", error);
    redirect("/auth/login?next=%2Fadmin");
  }

  if (!auth?.user) redirect("/auth/login?next=%2Fadmin");
  if (!isPlatformAdmin(auth.user)) notFound();

  const dashboard = await getAdminDashboardData();
  const maxRequests = Math.max(
    dashboard.providerUsage.topUsers[0]?.requests ?? 0,
    1
  );

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-muted-foreground">
            Instance administration
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Admin dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Counts and provider allowance activity only. Workspace content and
            threads are not shown.
          </p>
        </header>

        <section
          aria-label="Registration statistics"
          className="grid gap-4 sm:grid-cols-3"
        >
          <StatCard
            label="Registered users"
            value={dashboard.registrations.total}
          />
          <StatCard
            label="Joined in the last 7 days"
            value={dashboard.registrations.joinedLast7Days}
          />
          <StatCard
            label="Joined in the last 30 days"
            value={dashboard.registrations.joinedLast30Days}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <RankedList
            title="Top users by workspace items"
            rows={dashboard.topWorkspaceItems}
            countLabel="items"
          />
          <RankedList
            title="Top users by invitations"
            rows={dashboard.topInvitations}
            countLabel="invites"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Platform-provider usage</CardTitle>
            <p className="text-sm text-muted-foreground">
              {dashboard.providerUsage.total.requests} runs ·{" "}
              {dashboard.providerUsage.total.tokensIn} input tokens ·{" "}
              {dashboard.providerUsage.total.tokensOut} output tokens
            </p>
          </CardHeader>
          <CardContent>
            {dashboard.providerUsage.topUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No platform-provider usage yet.
              </p>
            ) : (
              <div className="space-y-4">
                {dashboard.providerUsage.topUsers.map((row, index) => {
                  const width = Math.max(4, (row.requests / maxRequests) * 100);
                  return (
                    <div key={`${row.email}-${index}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-2 text-muted-foreground">
                            {index + 1}.
                          </span>
                          {row.email}
                        </span>
                        <span className="shrink-0 font-medium">
                          {row.requests} runs
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-primary/20">
                        <div
                          aria-label={`${row.requests} provider runs`}
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.tokensIn} input · {row.tokensOut} output tokens
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent registrations</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.registrations.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No registrations found.
              </p>
            ) : (
              <ul className="divide-y">
                {dashboard.registrations.recent.map((registration, index) => (
                  <li
                    className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0"
                    key={`${registration.email}-${registration.joinedAt}-${index}`}
                  >
                    <span className="truncate">{registration.email}</span>
                    <time
                      className="shrink-0 text-muted-foreground"
                      dateTime={registration.joinedAt}
                    >
                      {formatDate(registration.joinedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Updated {formatDate(dashboard.generatedAt)}.
        </p>
      </div>
    </main>
  );
}
