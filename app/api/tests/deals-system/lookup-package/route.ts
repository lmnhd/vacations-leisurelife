import { exec } from "node:child_process";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { resolvePortCode } from "@/lib/campaigns/landing/port-codes";
import { runOdysseusLookup } from "@/lib/cb/deals-system/deal-package-resolution";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";
import { capturePackagePageTruth } from "@/lib/cb/link-broker/odysseus-lookup";
import type { RankedPackageCandidate } from "@/lib/cb/link-broker/package-lookup";
import {
  getOdysseusSession,
  releaseOdysseusSession,
} from "@/lib/services/odysseus/OdysseusSessionManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execAsync = promisify(exec);

interface LookupRequestBody {
  packageId?: unknown;
  line?: unknown;
  ship?: unknown;
  date?: unknown;
  nights?: unknown;
  destination?: unknown;
  port?: unknown;
  windowDays?: unknown;
  buildLink?: unknown;
  /** When true, skip the raw stdout/stderr transcript and return parsed cruise facts instead. */
  structured?: unknown;
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

function digitsOnly(value: string): string {
  let result = "";
  for (const char of value) {
    if (char >= "0" && char <= "9") result += char;
  }
  return result;
}

function quoteShell(value: string): string {
  return `"${value.replace(/(["^&|<>%])/g, "^$1")}"`;
}

/**
 * Cruise facts shaped for the Campaign Workbench's "Source & assemble" form —
 * the same fields the Trip Manifestation pipeline step resolves automatically
 * from a grounded discovery angle, surfaced here for a one-off manual lookup.
 */
function candidateToCruiseFacts(candidate: RankedPackageCandidate) {
  const departurePort = candidate.departurePortCode
    ? resolvePortCode(candidate.departurePortCode) ?? candidate.departurePortCode
    : undefined;

  return {
    packageId: candidate.packageId,
    cruiseLine: candidate.cruiseLine ?? "",
    shipName: candidate.shipName ?? "",
    title: candidate.cruiseName,
    nights: candidate.nights ?? undefined,
    sailDateIso: candidate.sailDateIso,
    departurePort,
    ports: candidate.portsOfCall ?? "",
    confidence: candidate.confidence,
    reasons: candidate.reasons,
  };
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
  const packageIdInput = optionalString(body.packageId);
  const packageId = packageIdInput ? digitsOnly(packageIdInput) : undefined;
  const ship = optionalString(body.ship);
  const date = optionalString(body.date);
  const destination = optionalString(body.destination);
  const port = optionalString(body.port);
  const nights = optionalNumber(body.nights);
  const windowDays = optionalNumber(body.windowDays);
  const buildLink = body.buildLink === true;
  const structured = body.structured === true;

  if (packageIdInput && !packageId) {
    return NextResponse.json({ error: "Package number must contain digits." }, { status: 400 });
  }

  if (packageId) {
    const startedAtIso = new Date().toISOString();
    const startedAt = Date.now();
    try {
      await getOdysseusSession();
      const truth = await capturePackagePageTruth(
        packageId,
        process.env.CB_AGENT_SIID ?? "1049337"
      );
      const summary = truth?.summary;
      if (!summary?.title || !summary.sailDateIso) {
        return NextResponse.json({
          ok: false,
          startedAtIso,
          finishedAtIso: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          message: `Package ${packageId} was not found or did not return complete sailing facts.`,
        });
      }

      const departurePort = summary.departurePortCode
        ? resolvePortCode(summary.departurePortCode) ?? summary.departurePortCode
        : undefined;

      return NextResponse.json({
        ok: true,
        startedAtIso,
        finishedAtIso: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: "package_match",
        cruiseFacts: {
          packageId,
          cruiseLine: summary.cruiseLine ?? "",
          shipName: summary.shipName ?? "",
          title: summary.title,
          nights: summary.nights,
          sailDateIso: summary.sailDateIso,
          departurePort,
          ports: summary.portsOfCall?.split("|").map((port) => port.trim()).filter(Boolean).join(", ") ?? "",
          cabinPricing: summary.cabinPricing,
          dayByDayItinerary: truth?.dayByDay?.days,
          confidence: 1,
          reasons: ["Exact package number match"],
        },
        candidates: [],
        diagnostics: [
          `Loaded exact Odysseus package ${packageId}.`,
          ...(truth?.diagnostics ?? []),
        ],
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        startedAtIso,
        finishedAtIso: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await releaseOdysseusSession().catch(() => undefined);
    }
  }

  if (!line && !ship) {
    return NextResponse.json(
      { error: "Enter a package number, cruise line, or ship name." },
      { status: 400 }
    );
  }

  // Structured mode: reuse the same one-call lookup the Trip Manifestation
  // pipeline step already trusts (lib/cb/deals-system/deal-package-resolution),
  // so the Workbench's "Find ship" control returns parsed cruise facts instead
  // of a stdout transcript the operator would otherwise re-type by hand.
  if (structured) {
    const startedAtIso = new Date().toISOString();
    const startedAt = Date.now();
    const lookup = await runOdysseusLookup(
      { line: line ?? "", ship, destination: destination ?? "", date, nights, port, windowDays: windowDays ?? 7 },
      { bestEffort: true }
    );

    if (!lookup.ok || !lookup.result) {
      return NextResponse.json({
        ok: false,
        command: lookup.command,
        startedAtIso,
        finishedAtIso: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        message: lookup.error ?? "Lookup failed.",
        diagnostics: lookup.diagnostics,
      });
    }

    const { result } = lookup;
    return NextResponse.json({
      ok: true,
      command: lookup.command,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      status: result.status,
      cruiseFacts: result.selected ? candidateToCruiseFacts(result.selected) : null,
      candidates: result.candidates.map(candidateToCruiseFacts),
      diagnostics: [...lookup.diagnostics, ...result.diagnostics],
    });
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
