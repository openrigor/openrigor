#!/usr/bin/env tsx

/**
 * Merge local workspace starters into the knowledge template snapshot.
 *
 * Usage:
 *   yarn generate:workspace-templates
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeWorkspaceTemplates,
  type GeneratedTemplateCatalog,
} from "./generate-template-catalog";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const outputPath = path.resolve(
  process.env.EVALUCHAT_TEMPLATE_CATALOG_OUTPUT ||
    path.join(repoRoot, "apps/web/data/template-catalog.json"),
);

const existing = JSON.parse(
  fs.readFileSync(outputPath, "utf8"),
) as GeneratedTemplateCatalog;
const artifact = mergeWorkspaceTemplates(existing);
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
  `Merged workspace templates into ${path.relative(repoRoot, outputPath)}`,
);
