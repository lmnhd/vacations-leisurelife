import { exec } from "node:child_process";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { getDealsSystemOperatorAction } from "@/lib/cb/deals-system/operator-actions";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execAsync = promisify(exec);

interface RunRequestBody {
  actionId?: unknown;
}

interface ExecFailure extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
  signal?: NodeJS.Signals;
}

function isExecFailure(error: unknown): error is ExecFailure {
  return error instanceof Error;
}

export async function POST(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  let body: RunRequestBody;
  try {
    body = (await request.json()) as RunRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.actionId !== "string") {
    return NextResponse.json({ error: "actionId is required." }, { status: 400 });
  }

  const action = getDealsSystemOperatorAction(body.actionId);
  if (!action) {
    return NextResponse.json(
      { error: `Unsupported Deals system action: ${body.actionId}` },
      { status: 400 }
    );
  }

  const startedAtIso = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const result = await execAsync(`npm run ${action.npmScript}`, {
      cwd: process.cwd(),
      timeout: action.timeoutMs,
      maxBuffer: 1024 * 1024 * 12,
      windowsHide: true,
    });

    return NextResponse.json({
      ok: true,
      action,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    const failure = isExecFailure(error) ? error : undefined;
    return NextResponse.json(
      {
        ok: false,
        action,
        startedAtIso,
        finishedAtIso: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        exitCode: failure?.code ?? 1,
        signal: failure?.signal,
        message: failure?.message ?? String(error),
        stdout: failure?.stdout ?? "",
        stderr: failure?.stderr ?? "",
      },
      { status: 200 }
    );
  }
}
