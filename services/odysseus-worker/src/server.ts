import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod/v3";

import { runOdysseusSearch } from "../../../lib/chat/tools/odysseus-search";
import { releaseOdysseusSession } from "../../../lib/services/odysseus/OdysseusSessionManager";

const PORT = Number(process.env.PORT ?? 10000);
const WORKER_TOKEN = process.env.ODYSSEUS_WORKER_TOKEN ?? "";
const MAX_BODY_BYTES = 16_384;
let searchTail: Promise<void> = Promise.resolve();

const SearchSchema = z.object({
  vendorId: z.number().int().positive().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  passengers: z.number().int().positive().max(12),
  guestAges: z.array(z.number().int().positive().max(120)).max(12),
}).strict();

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = request.url ?? "/";
  if (request.method === "GET" && (url === "/" || url === "/healthz")) {
    respondJson(response, 200, {
      status: "ok",
      service: "leisure-life-odysseus-worker",
      configured: {
        token: WORKER_TOKEN.length > 0,
        cbCredentials: Boolean(process.env.CB_EMAIL && process.env.CB_PASSWORD),
      },
    });
    return;
  }

  if (request.method !== "POST" || url !== "/internal/odysseus-search") {
    respondJson(response, 404, { error: "not_found" });
    return;
  }

  const suppliedToken = headerValue(request, "x-odysseus-worker-token") ?? "";
  if (!WORKER_TOKEN || !constantTimeEquals(WORKER_TOKEN, suppliedToken)) {
    respondJson(response, 401, { error: "unauthorized" });
    return;
  }

  const rawBody = await readBody(request, MAX_BODY_BYTES);
  if (!rawBody.ok) {
    respondJson(response, 413, { error: "request_too_large" });
    return;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody.value) as unknown;
  } catch {
    respondJson(response, 400, { error: "invalid_request_body" });
    return;
  }
  const parsed = SearchSchema.safeParse(parsedJson);
  if (!parsed.success) {
    respondJson(response, 400, { error: "invalid_request_body" });
    return;
  }

  const startedMs = Date.now();
  const result = await runSerializedSearch(parsed.data);
  const ok = result.status !== "error";
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    event: result.status === "success"
      ? "odysseus.search_completed"
      : result.status === "no_matches"
        ? "odysseus.search_no_matches"
        : "odysseus.search_failed",
    durationMs: Date.now() - startedMs,
    resultCount: result.results.length,
  }));
  respondJson(response, ok ? 200 : 502, ok
    ? { data: result }
    : { error: "odysseus_search_unavailable" });
}

async function runSerializedSearch(
  input: z.infer<typeof SearchSchema>
): Promise<Awaited<ReturnType<typeof runOdysseusSearch>>> {
  const previous = searchTail;
  let release: () => void = () => undefined;
  searchTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await runOdysseusSearch(input);
  } finally {
    release();
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readBody(
  request: IncomingMessage,
  maxBytes: number
): Promise<{ ok: true; value: string } | { ok: false }> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    let received = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      received += Buffer.byteLength(chunk);
      if (received <= maxBytes) chunks.push(chunk);
    });
    request.on("end", () => {
      if (received > maxBytes) resolve({ ok: false });
      else resolve({ ok: true, value: chunks.join("") });
    });
  });
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    event: "service.shutdown_started",
    reason: signal,
  }));
  server.close();
  await releaseOdysseusSession();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(PORT, () => {
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    event: "service.started",
    port: PORT,
  }));
});

export { server };
