import { NextResponse } from "next/server";
import { isGithubResearchWorkspacesEnabled } from "@/lib/research-workspaces-enabled.server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  readGithubResearchCredentials,
  updateGithubInstallationRepositories,
  type DecryptedGithubResearchCredentials,
} from "@/lib/workspace/research-repository/credentials";
import {
  getGithubInstallationRepository,
  listGithubInstallationRepositories,
} from "@/lib/workspace/research-repository/github-app";

export const dynamic = "force-dynamic";

type SnapshotRepository = {
  id: number;
  nameWithOwner: string;
};

async function listRetainedSnapshotRepositories(
  credentials: DecryptedGithubResearchCredentials
): Promise<SnapshotRepository[]> {
  const installationId = credentials.installationId;
  if (installationId === undefined) return [];
  const displayRepositories = credentials.displayMetadata.repositories;
  const repositoryIds = new Set(credentials.repositoryIds);
  const retainedRepositories = Array.isArray(displayRepositories)
    ? displayRepositories.filter(
        (
          entry
        ): entry is {
          id: number;
          nameWithOwner?: string;
          private?: boolean;
        } =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as { id?: unknown }).id === "number" &&
          repositoryIds.has((entry as { id: number }).id)
      )
    : [];
  return (
    await Promise.all(
      retainedRepositories.map(async (entry) => {
        let isPrivate = entry.private;
        let nameWithOwner = entry.nameWithOwner;
        const needsLookup = isPrivate !== true && isPrivate !== false;
        const needsName = !nameWithOwner || nameWithOwner.trim() === "";
        if (needsLookup || needsName) {
          try {
            const repository = await getGithubInstallationRepository(
              installationId,
              entry.id
            );
            if (needsLookup) isPrivate = repository.private;
            if (needsName) nameWithOwner = repository.nameWithOwner;
          } catch {
            if (needsLookup) return undefined;
          }
        }
        if (!isPrivate) return undefined;
        return {
          id: entry.id,
          nameWithOwner:
            typeof nameWithOwner === "string"
              ? nameWithOwner
              : `Repository #${entry.id}`,
        };
      })
    )
  ).filter((entry): entry is SnapshotRepository => Boolean(entry));
}

export async function GET() {
  if (!isGithubResearchWorkspacesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const credentials = await readGithubResearchCredentials(auth.user.id);
    if (!credentials || credentials.installationId === undefined) {
      return NextResponse.json({ connected: false, repositories: [] });
    }
    const installationId = credentials.installationId;
    const login = credentials.displayMetadata.login;
    let repositories: SnapshotRepository[];
    try {
      const live = await listGithubInstallationRepositories(installationId);
      repositories = live.map((entry) => ({
        id: entry.id,
        nameWithOwner: entry.nameWithOwner,
      }));
      const livePrivateIds = live
        .filter((entry) => entry.private)
        .map((entry) => entry.id);
      const livePrivateSet = new Set(livePrivateIds);
      const storedIds = credentials.repositoryIds;
      const addedRepositoryIds = livePrivateIds.filter(
        (id) => !storedIds.includes(id)
      );
      const removedRepositoryIds = storedIds.filter(
        (id) => !livePrivateSet.has(id)
      );
      try {
        await updateGithubInstallationRepositories(
          auth.user.id,
          addedRepositoryIds,
          removedRepositoryIds
        );
      } catch {
        // Snapshot reconciliation must never fail the listing request.
      }
    } catch {
      repositories = await listRetainedSnapshotRepositories(credentials);
    }
    return NextResponse.json({
      connected: true,
      installationId: credentials.installationId,
      login: typeof login === "string" ? login : undefined,
      repositories,
    });
  } catch (error) {
    console.error("[github-research] failed to list repositories", error);
    return NextResponse.json(
      { error: "Could not load GitHub repositories" },
      { status: 500 }
    );
  }
}
