import { NextResponse } from "next/server";
import { listApparatuses } from "@/lib/apparatuses/registry";

/**
 * Public, read-only view of the reviewed method catalog.
 *
 * Specifications and immutable profiles are public research artefacts. Org
 * enablement is deliberately kept on the authenticated organisation route.
 */
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    methods: listApparatuses(),
    generatedAt: new Date().toISOString(),
  });
}
