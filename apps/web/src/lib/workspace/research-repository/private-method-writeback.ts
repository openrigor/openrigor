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
  assertRepositoryWriteAccess,
} from "./access";
import {
  commitArtifactBlobs,
  repositoryCommitProvenance,
  type GithubCommitAuthor,
} from "./git-adapter";
import type { RepositoryCommitProvenance } from "@opencanvas/shared/research-repository";
import type { RepositorySealAccess } from "./seals";
import { repositoryLayoutPrefix } from "./layout";

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
  const { repository, currentHead: headCommitSha } =
    await assertRepositoryWriteAccess({
      installationId: item.binding.installationId,
      repositoryId: item.binding.repositoryId,
      branch: item.binding.branch,
      expectedHeadSha: item.binding.headCommitSha,
      layoutVersion: item.binding.layoutVersion,
    });
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
}): Promise<{ commitSha: string; provenance: RepositoryCommitProvenance }> {
  const relativePrefix = `methods/${input.methodId}/evidence/`;
  const suppliedRelativePath = input.filePath.startsWith("openrigor/")
    ? input.filePath.slice("openrigor/".length)
    : input.filePath;
  if (!suppliedRelativePath.startsWith(relativePrefix)) {
    throw new Error("Private evidence path does not match Method provenance");
  }
  const { repositoryItemId, access } = await privateMethodRepositoryAccess(
    input.userId,
    input.provenance
  );
  if (
    access.binding.layoutVersion === "1.0" &&
    input.filePath !== suppliedRelativePath
  ) {
    throw new Error("Private evidence path does not match Method provenance");
  }
  const filePath = `${repositoryLayoutPrefix(access.binding.layoutVersion)}${suppliedRelativePath}`;
  const commitSha = await commitArtifactBlobs(
    access.binding.installationId,
    access.repository,
    access.binding.branch,
    {
      authorUser: repositoryCommitAuthor(access),
      message: `File evidence for ${input.methodId}`,
      baseSha: access.binding.headCommitSha,
      files: [{ path: filePath, content: input.markdown }],
      ...(access.binding.layoutVersion === "1.0"
        ? {}
        : { layoutVersion: access.binding.layoutVersion }),
    }
  );
  await updateResearchRepositoryBindingHead(
    input.userId,
    repositoryItemId,
    commitSha
  );
  return {
    commitSha,
    provenance: repositoryCommitProvenance(
      access.repository,
      access.binding.branch,
      filePath,
      commitSha
    ),
  };
}
