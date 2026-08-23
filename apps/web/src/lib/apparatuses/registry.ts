import { APPARATUS_CATALOG, ApparatusCatalogEntry } from "./catalog";

/**
 * @server-only — apparatus catalog access.
 * Currently returns the stub mirror; later a build-time artifact from the OKF catalog.
 */
export function listApparatuses(): ApparatusCatalogEntry[] {
  return APPARATUS_CATALOG;
}

export function getApparatusById(
  id: string
): ApparatusCatalogEntry | undefined {
  return APPARATUS_CATALOG.find((a) => a.id === id);
}
