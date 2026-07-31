import { NextResponse } from "next/server";

/**
 * Same-origin proxy for third-party candidate images.
 *
 * Google Image Search gives us two URLs per candidate: `thumbnailUrl` (Google's
 * own cached copy, which always loads) and `imageUrl` (the publisher's origin).
 * The curation grid renders thumbnails, so it looks healthy — but the
 * full-screen lightbox renders `imageUrl`, and a large share of publisher hosts
 * either block hotlinking by Referer, require a browser-ish User-Agent, or have
 * since 404'd. The browser then renders the alt text as sprawling body copy in
 * the middle of the overlay.
 *
 * Fetching server-side sidesteps all three: no cross-origin Referer is sent, we
 * control the User-Agent, and a genuine failure surfaces as a non-OK status the
 * client can fall back on instead of a broken <img>.
 */

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("url");
  if (!requested) {
    return new NextResponse("Missing ?url", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(requested);
  } catch {
    return new NextResponse("Malformed ?url", { status: 400 });
  }

  // Only ever reach out over http(s) to a public host. Without this the route
  // is an SSRF gadget: any caller could pin it at file://, at cloud instance
  // metadata, or at services bound to the app's own network.
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return new NextResponse("Unsupported protocol", { status: 400 });
  }
  if (isPrivateHost(target.hostname)) {
    return new NextResponse("Refusing to proxy a private host", { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Publisher CDNs routinely 403 a bare fetch agent. No Referer header —
        // that omission is the point, since Referer is what hotlink rules read.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream responded ${upstream.status}`, {
        status: 502,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    // A hotlink block often answers 200 with an HTML "no leeching" page. Passing
    // that through would paint a broken image just as surely as a 403.
    if (!contentType.startsWith("image/")) {
      return new NextResponse(`Upstream returned ${contentType || "unknown"}, not an image`, {
        status: 502,
      });
    }

    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BYTES) {
      return new NextResponse("Upstream image too large", { status: 502 });
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return new NextResponse("Upstream image too large", { status: 502 });
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        // These are immutable third-party stills; caching keeps repeat
        // magnifications of the same candidate off the publisher's origin.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return new NextResponse(aborted ? "Upstream timed out" : "Upstream fetch failed", {
      status: 502,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return true;
  }
  // Bracketed IPv6 loopback / unique-local.
  const v6 = host.replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")) {
    return true;
  }
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local, incl. cloud metadata at 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
