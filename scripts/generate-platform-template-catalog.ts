#!/usr/bin/env tsx

/**
 * Build the bundled platform template snapshot (method run briefs).
 *
 * Usage:
 *   yarn generate:platform-templates
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  platformTemplateRoot,
  writeCatalog,
} from "./generate-template-catalog";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const outputPath = path.resolve(
  process.env.EVALUCHAT_PLATFORM_TEMPLATE_CATALOG_OUTPUT ||
    path.join(repoRoot, "apps/web/data/platform-template-catalog.json"),
);

writeCatalog(platformTemplateRoot(), outputPath, {
  sourcePathPrefix: "templates/platform",
});
console.log(
  `Generated ${path.relative(repoRoot, outputPath)} from ${platformTemplateRoot()}`,
);
