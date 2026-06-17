import { NextResponse } from "next/server";

/**
 * The Deals workflow API (/api/tests/deals-system/**) is operator build tooling —
 * discovery, manifestation, copywriting, publishing, etc. It reads/writes local
 * cache files and is never meant to run on the deployed site. Call this at the top
 * of each route handler; on Vercel production it short-circuits with a 404.
 */
export function blockInProduction(): NextResponse | null {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not available in production." }, { status: 404 });
  }
  return null;
}
