/**
 * Read and verify the private synthetic GitHub fixture used by public-beta
 * E2E tests. Secrets come only from exported E2E_BETA_* variables; no dotenv
 * file is read. The required helper fails hard, while the optional status
 * helper lets a smoke test record an intentional skip after auth assertions.
 */
import type { TestInfo } from "@playwright/test";
import { requireEnv } from "./auth";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export type GithubFixtureConfig = {
  token: string;
  owner: string;
  repository: string;
  nameWithOwner: string;
};

export type GithubFixtureEnvStatus =
  | { available: true; config: GithubFixtureConfig }
  | { available: false; reason: string };

export type GithubFixtureRepository = {
  id: number;
  nameWithOwner: string;
  private: boolean;
};

export type GithubFixtureRepositoryCheck =
  | {
      exists: true;
      isPrivate: boolean;
      repository: GithubFixtureRepository;
      skipReason?: string;
    }
  | {
      exists: false;
      isPrivate: false;
      repository?: undefined;
      skipReason: string;
    };

function parseFixtureRepository(value: string): {
  owner: string;
  repository: string;
} {
  const parts = value.split("/");
  if (
    parts.length !== 2 ||
    parts.some((part) => part.length === 0 || /\s/.test(part))
  ) {
    throw new Error(
      "E2E_BETA_FIXTURE_REPO must be an owner/repo name without whitespace",
    );
  }
  const [owner, repository] = parts;
  return { owner, repository };
}

/** Return fixture env status without throwing, for an intentional test skip. */
export function getGithubFixtureEnv(): GithubFixtureEnvStatus {
  const token = process.env.E2E_BETA_GITHUB_TOKEN?.trim();
  const repositoryValue = process.env.E2E_BETA_FIXTURE_REPO?.trim();
  const missing = [
    !token ? "E2E_BETA_GITHUB_TOKEN" : undefined,
    !repositoryValue ? "E2E_BETA_FIXTURE_REPO" : undefined,
  ].filter((key): key is string => key !== undefined);

  if (missing.length > 0) {
    return {
      available: false,
      reason: `Missing GitHub fixture secret(s): ${missing.join(", ")}`,
    };
  }

  if (!token || !repositoryValue) {
    throw new Error("GitHub fixture environment could not be read");
  }

  const { owner, repository } = parseFixtureRepository(repositoryValue);
  return {
    available: true,
    config: {
      token,
      owner,
      repository,
      nameWithOwner: `${owner}/${repository}`,
    },
  };
}

/** Require a complete fixture configuration; missing env fails the suite hard. */
export function requireGithubFixture(): GithubFixtureConfig {
  const { E2E_BETA_GITHUB_TOKEN, E2E_BETA_FIXTURE_REPO } = requireEnv(
    "E2E_BETA_GITHUB_TOKEN",
    "E2E_BETA_FIXTURE_REPO",
  );
  const { owner, repository } = parseFixtureRepository(E2E_BETA_FIXTURE_REPO);
  return {
    token: E2E_BETA_GITHUB_TOKEN,
    owner,
    repository,
    nameWithOwner: `${owner}/${repository}`,
  };
}

/** Record the reason that a fixture-dependent test was intentionally skipped. */
export function recordGithubFixtureSkipReason(
  testInfo: TestInfo,
  reason: string,
): void {
  testInfo.annotations.push({ type: "skip", description: reason });
}

/** Verify that the configured GitHub repository exists and remains private. */
export async function verifyGithubFixtureRepository(
  fixture: GithubFixtureConfig = requireGithubFixture(),
): Promise<GithubFixtureRepositoryCheck> {
  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(fixture.owner)}/${encodeURIComponent(fixture.repository)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${fixture.token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  );

  if (response.status === 404) {
    return {
      exists: false,
      isPrivate: false,
      skipReason: `GitHub fixture repository ${fixture.nameWithOwner} was not found or is not accessible`,
    };
  }
  if (!response.ok) {
    throw new Error(
      `GitHub fixture repository check failed with HTTP ${response.status}`,
    );
  }

  const body = (await response.json()) as {
    id?: unknown;
    full_name?: unknown;
    private?: unknown;
  };
  if (typeof body.id !== "number") {
    throw new Error("GitHub fixture repository response did not include an id");
  }

  const nameWithOwner =
    typeof body.full_name === "string" ? body.full_name : fixture.nameWithOwner;
  const isPrivate = body.private === true;
  return {
    exists: true,
    isPrivate,
    repository: {
      id: body.id,
      nameWithOwner,
      private: isPrivate,
    },
    ...(isPrivate
      ? {}
      : {
          skipReason: `GitHub fixture repository ${nameWithOwner} must be private`,
        }),
  };
}
