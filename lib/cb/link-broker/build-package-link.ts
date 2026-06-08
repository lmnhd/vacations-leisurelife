/**
 * Class 1 - Package Entry Link builder.
 *
 *   https://bookings.cbagenttools.com/swift/cruise/package/{PACKAGE_ID}--{slug}?siid={AGENT_ID}&lang=1
 *
 * The safest broad entry point. Used when only package ID + siid are known, or
 * when traveler setup is incomplete. No portal-generated fields involved.
 */

import { ODYSSEUS_BOOKINGS_HOST } from "./normalize";
import type { PackageEntryLinkInput } from "./types";

export function buildPackageEntryLink(input: PackageEntryLinkInput): string {
  const packageId = input.packageId.trim();
  if (!packageId) {
    throw new Error("buildPackageEntryLink: packageId is required");
  }
  if (!input.siid.trim()) {
    throw new Error("buildPackageEntryLink: siid is required");
  }

  const segment = input.slug ? `${packageId}--${input.slug}` : packageId;
  const lang = input.lang ?? 1;

  // Built by hand (not URL/searchParams) so the path segment's `--` and the
  // exact parameter order match the format CB exposes on share links.
  return `https://${ODYSSEUS_BOOKINGS_HOST}/swift/cruise/package/${segment}?siid=${input.siid.trim()}&lang=${lang}`;
}
