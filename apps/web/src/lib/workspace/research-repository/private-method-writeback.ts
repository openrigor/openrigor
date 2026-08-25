import type { MethodSource } from "../types";
import {
  getWorkspaceItem,
  updateResearchRepositoryBindingHead,
} from "../store";
import { readGithubResearchCredentials } from "./credentials";
import {
  REPOSITORY_DISCONNECTED,
  REPOSITORY_UNAVAILABLE,
  RepositoryAccessError,
  assertRepositoryPrivate,
  loadInstallationRepository,
} from "./access";
import {
  commitArtifactBlobs,
  getRepositoryBranchHead,
  type GithubCommitAuthor,
} from "./git-adapter";
import type { RepositorySealAccess } from "./seals";

type PrivateRepository = NonNullable<MethodSource["privateRepository"]>;

export function repositoryCommitAuthor(
  access: RepositorySealAccess
): GithubCommitAuthor | undefined {
  const login = access.credentials.displayMetadata.login;
  const userId = access.credentials.displayMetadata.githubUserId;
  return typeof login === "string" && typeof userId === "number"
    ? {
        name: login,
        email: `${userId}+${login}@users.noreply.github.com`,
      }
    : undefined;
}

export async function privateMethodRepositoryAccess(
  userId: string,
  provenance: PrivateRepository
): Promise<{
  repositoryItemId: string;
  access: RepositorySealAccess;
}> {
  const item = await getWorkspaceItem(userId, provenance.repositoryItemId);
  if (
    !item ||
    item.kind !== "research_repository" ||
    item.binding.repositoryId !== provenance.repositoryId
  ) {
    throw new RepositoryAccessError(
      REPOSITORY_UNAVAILABLE,
      "Private Method repository is unavailable"
    );
  }
  const credentials = await readGithubResearchCredentials(userId);
  if (
    !credentials ||
    credentials.installationId !== item.binding.installationId ||
    !credentials.repositoryIds.includes(item.binding.repositoryId)
  ) {
    throw new RepositoryAccessError(
      REPOSITORY_DISCONNECTED,
      "Research repository is disconnected"
    );
  }
  const repository = await loadInstallationRepository(
    item.binding.installationId,
    item.binding.repositoryId
  );
  assertRepositoryPrivate(repository);
  const headCommitSha = await getRepositoryBranchHead(
    item.binding.installationId,
    repository,
    item.binding.branch
  );
  return {
    repositoryItemId: item.id,
    access: {
      binding: { ...item.binding, headCommitSha },
      credentials,
      repository,
    },
  };
}

export async function commitPrivateMethodEvidence(input: {
  userId: string;
  provenance: PrivateRepository;
  methodId: string;
  filePath: string;
  markdown: string;
}): Promise<{ commitSha: string }> {
  const expectedPrefix = `methods/${input.methodId}/evidence/`;
  if (!input.filePath.startsWith(expectedPrefix)) {
    throw new Error("Private evidence path does not match Method provenance");
  }
  const { repositoryItemId, access } = await privateMethodRepositoryAccess(
    input.userId,
    input.provenance
  );
  const commitSha = await commitArtifactBlobs(
    access.binding.installationId,
    access.repository,
    access.binding.branch,
    {
      authorUser: repositoryCommitAuthor(access),
      message: `File evidence for ${input.methodId}`,
      baseSha: access.binding.headCommitSha,
      files: [{ path: input.filePath, content: input.markdown }],
    }
  );
  await updateResearchRepositoryBindingHead(
    input.userId,
    repositoryItemId,
    commitSha
  );
  return { commitSha };
}
