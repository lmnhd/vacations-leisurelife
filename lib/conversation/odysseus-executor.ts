import {
  runOdysseusSearch,
  type OdysseusSearchInput,
  type OdysseusSearchOutput,
} from "@/lib/chat/tools/odysseus-search";

export type OdysseusExecutorResult =
  | { ok: true; output: OdysseusSearchOutput; executor: "local" | "render_worker" }
  | { ok: false; status: 502 | 503 | 504; error: string; executor: "local" | "render_worker" };

const WORKER_TIMEOUT_MS = 85_000;

export async function executeOdysseusSearch(
  input: OdysseusSearchInput
): Promise<OdysseusExecutorResult> {
  const workerUrl = process.env.ODYSSEUS_WORKER_URL?.trim();
  if (!workerUrl) {
    if (process.env.VERCEL || process.env.VERCEL_ENV) {
      return {
        ok: false,
        status: 503,
        error: "odysseus_worker_not_configured",
        executor: "render_worker",
      };
    }
    const output = await runOdysseusSearch(input);
    return output.status === "error"
      ? { ok: false, status: 502, error: "odysseus_search_unavailable", executor: "local" }
      : { ok: true, output, executor: "local" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  try {
    const response = await fetch(`${trimTrailingSlashes(workerUrl)}/internal/odysseus-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-odysseus-worker-token": process.env.ODYSSEUS_WORKER_TOKEN ?? "",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as
      | { data?: OdysseusSearchOutput; error?: string }
      | null;
    if (!response.ok || !body?.data) {
      return {
        ok: false,
        status: response.status === 504 ? 504 : 502,
        error: body?.error ?? `odysseus_worker_${response.status}`,
        executor: "render_worker",
      };
    }
    if (body.data.status === "error") {
      return {
        ok: false,
        status: 502,
        error: "odysseus_search_unavailable",
        executor: "render_worker",
      };
    }
    return { ok: true, output: body.data, executor: "render_worker" };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error: error instanceof Error && error.name === "AbortError"
        ? "odysseus_worker_timeout"
        : "odysseus_worker_unavailable",
      executor: "render_worker",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function trimTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith("/")) result = result.slice(0, -1);
  return result;
}
