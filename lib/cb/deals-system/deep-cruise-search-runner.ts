/**
 * Operator-run Deep Cruise Search invocation (Deal Workflow Step 1A, route side).
 *
 * Shells out to `npm run deep-cruise-search` (the operator-run Playwright sweep)
 * and parses its `---DEEP_CRUISE_SEARCH_RESULT_JSON---` block into the already-
 * scored `SelectedDeal[]`. Kept OUT of the barrel and separate from the pure
 * scorer (`deep-cruise-search.ts`) because it imports `node:child_process` and
 * must never be pulled into a client bundle — only API routes import it.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { DeepCruiseSelectionResult, SelectedDeal } from "./deep-cruise-search";

const execAsync = promisify(exec);

export interface RunDeepCruiseSearchOptions {
  /** How many top deals to select. */
  selectCount?: number;
  /** Forward-month window offsets, e.g. [6, 12, 18]. */
  months?: number[];
}

export interface RunDeepCruiseSearchOutput {
  ok: boolean;
  result?: DeepCruiseSelectionResult;
  error?: string;
  command: string;
  diagnostics: string[];
  durationMs: number;
}

/** Run the operator sweep and return the scored selection (or an error). */
export async function runDeepCruiseSearch(
  options: RunDeepCruiseSearchOptions = {}
): Promise<RunDeepCruiseSearchOutput> {
  const args: string[] = [];
  if (options.selectCount) args.push("--select", String(options.selectCount));
  if (options.months && options.months.length > 0) args.push("--months", options.months.join(","));

  const command = `npm run deep-cruise-search -- ${args.join(" ")}`.trim();
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 300_000,
      maxBuffer: 1024 * 1024 * 16,
      windowsHide: true,
    });
    const diagnostics: string[] = [];
    if (stderr) diagnostics.push(stderr.slice(0, 2000));
    diagnostics.push(`Script exit 0 | ${Date.now() - startedAt}ms`);

    const result = parseDeepSearchStdout(stdout);
    if (!result) {
      return {
        ok: false,
        error: "Deep cruise search produced no parseable result block.",
        command,
        diagnostics,
        durationMs: Date.now() - startedAt,
      };
    }
    return { ok: true, result, command, diagnostics, durationMs: Date.now() - startedAt };
  } catch (error) {
    const failure = error as { code?: number | string; stderr?: string; message?: string };
    return {
      ok: false,
      error: failure.message ?? String(error),
      command,
      diagnostics: [failure.stderr ?? "", `Script exit ${String(failure.code ?? 1)}`],
      durationMs: Date.now() - startedAt,
    };
  }
}

/** Parse the script's machine-readable JSON block into a DeepCruiseSelectionResult. */
function parseDeepSearchStdout(stdout: string): DeepCruiseSelectionResult | undefined {
  const match = stdout.match(/---DEEP_CRUISE_SEARCH_RESULT_JSON---\n([\s\S]*?)\n---END_JSON---/);
  if (!match) return undefined;
  try {
    const payload = JSON.parse(match[1]) as unknown;
    if (typeof payload !== "object" || payload === null) return undefined;
    const p = payload as Record<string, unknown>;
    const selected = Array.isArray(p.selected) ? (p.selected as SelectedDeal[]) : [];
    const ranked = Array.isArray(p.ranked) ? (p.ranked as SelectedDeal[]) : selected;
    const diagnostics = Array.isArray(p.diagnostics) ? p.diagnostics.map((d) => String(d)) : [];
    return { selected, ranked, diagnostics };
  } catch {
    return undefined;
  }
}
