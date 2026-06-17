import { exec } from "node:child_process";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execAsync = promisify(exec);

interface LookupRequestBody {
  line?: unknown;
  ship?: unknown;
  date?: unknown;
  nights?: unknown;
  destination?: unknown;
  port?: unknown;
  windowDays?: unknown;
  buildLink?: unknown;
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

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function quoteShell(value: string): string {
  return `"${value.replace(/(["^&|<>%])/g, "^$1")}"`;
}

export async function POST(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  let body: LookupRequestBody;
  try {
    body = (await request.json()) as LookupRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const line = optionalString(body.line);
  const ship = optionalString(body.ship);
  const date = optionalString(body.date);
  const destination = optionalString(body.destination);
  const port = optionalString(body.port);
  const nights = optionalNumber(body.nights);
  const windowDays = optionalNumber(body.windowDays);
  const buildLink = body.buildLink === true;

  if (!line && !ship) {
    return NextResponse.json(
      { error: "Provide at least a cruise line or ship name." },
      { status: 400 }
    );
  }

  const args: string[] = [];
  if (line) args.push("--line", quoteShell(line));
  if (ship) args.push("--ship", quoteShell(ship));
  if (date) args.push("--date", quoteShell(date));
  if (nights) args.push("--nights", String(nights));
  if (destination) args.push("--destination", quoteShell(destination));
  if (port) args.push("--port", quoteShell(port));
  if (windowDays) args.push("--window", String(windowDays));
  if (buildLink) args.push("--build-link");

  const command = `npm run lookup-odysseus-package -- ${args.join(" ")}`;
  const startedAtIso = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const result = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 300_000,
      maxBuffer: 1024 * 1024 * 8,
      windowsHide: true,
    });

    return NextResponse.json({
      ok: true,
      command,
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
        command,
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
