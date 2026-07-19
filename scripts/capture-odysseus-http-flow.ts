/**
 * Captures the Odysseus booking HTTP contract without storing guest values.
 *
 * The operator drives the visible browser manually. This recorder saves:
 * - request methods, sanitized URLs, resource types, and body field structure
 * - response status codes and content types
 * - main-frame navigation history
 * - form actions and field names rendered on each page
 *
 * It never saves cookies, authorization headers, response bodies, or form values.
 * It also blocks the known final checkout submit control so the capture cannot
 * make a payment or complete a reservation.
 */

import { chromium, type Page, type Request, type Response, type Route } from "playwright";
import * as fs from "fs";
import * as path from "path";

const STATE_FILE = path.join(process.cwd(), ".playwright-state.json");
const DEFAULT_PACKAGE_URL =
  "https://bookings.cbagenttools.com/swift/cruise/package/1553111?siid=1049337&lang=1";
const DEFAULT_CAPTURE_ROOT = path.join(process.cwd(), "tmp", "odysseus-http-flow");
const ALLOWED_HOSTS = [
  "bookings.cbagenttools.com",
  "contents.odysol.com",
  "www.cbagenttools.com",
];
const CAPTURED_RESOURCE_TYPES = ["document", "xhr", "fetch"];
const SAFE_QUERY_KEYS = [
  "source",
  "pid",
  "packagetourid",
  "lang",
  "p1",
  "skipdetails",
  "op",
  "tt",
  "officeid",
  "checkoutmethod",
  "catcode",
  "ratecode",
  "pricecatcode",
  "groupid",
  "contentonly",
  "section",
  "supplierid",
  "brandid",
  "cruisetabnavigationversion",
  "requestsource",
];
const FINAL_SUBMIT_MARKERS = [
  "_ctl0:MainContentsPH:_ctl0:ContinueBTN",
  "CompletePaymentButton",
];
const INVENTORY_MUTATION_CANDIDATE_PATHS = [
  "/web/cruises/category.aspx",
  "/web/cruises/cabin.aspx",
];

type CaptureEvent =
  | {
      kind: "request";
      at: string;
      id: number;
      method: string;
      url: string;
      resourceType: string;
      isNavigationRequest: boolean;
      headerNames: string[];
      body: unknown;
      paymentSubmissionBlocked: boolean;
      inventoryMutationCandidate: boolean;
      inventoryMutationKind: "category-selection" | "cabin-selection" | null;
    }
  | {
      kind: "response";
      at: string;
      requestId: number | null;
      url: string;
      status: number;
      contentType: string;
    }
  | {
      kind: "navigation";
      at: string;
      url: string;
      title: "[redacted]";
    }
  | {
      kind: "capture-started" | "capture-stopped";
      at: string;
      detail: string;
    };

type FormFieldSnapshot = {
  tag: string;
  type: string;
  name: string;
  id: string;
  required: boolean;
  disabled: boolean;
  dataOdyId: string;
};

type FormSnapshot = {
  method: string;
  action: string;
  fields: FormFieldSnapshot[];
};

type PageSnapshot = {
  capturedAt: string;
  url: string;
  title: "[redacted]";
  forms: FormSnapshot[];
};

function readOption(name: string): string | null {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return null;
  return args[index + 1];
}

function makeTimestamp(): string {
  return new Date().toISOString().split(":").join("-").split(".").join("-");
}

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.includes(hostname.toLowerCase());
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const entries = Array.from(parsed.searchParams.entries());
    parsed.search = "";

    for (const [key, value] of entries) {
      const safeValue = SAFE_QUERY_KEYS.includes(key.toLowerCase()) ? value : "[redacted]";
      parsed.searchParams.append(key, safeValue);
    }

    return parsed.toString();
  } catch {
    return "[unparseable-url]";
  }
}

function describeJsonStructure(value: unknown): unknown {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      items: value.slice(0, 10).map((item) => describeJsonStructure(item)),
    };
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = describeJsonStructure(child);
    }
    return result;
  }
  return { type: typeof value };
}

function describeRequestBody(request: Request): unknown {
  const postData = request.postData();
  if (!postData) return null;

  const contentType = request.headers()["content-type"] ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const fields = Array.from(new URLSearchParams(postData).keys()).map((name) => ({ name }));
    return { encoding: "form", fields };
  }

  if (contentType.includes("application/json")) {
    try {
      return { encoding: "json", structure: describeJsonStructure(JSON.parse(postData) as unknown) };
    } catch {
      return { encoding: "json", parseFailed: true, length: postData.length };
    }
  }

  return { encoding: contentType || "unknown", length: postData.length };
}

function isPaymentSubmission(request: Request): boolean {
  if (request.method() !== "POST") return false;
  const postData = request.postData() ?? "";
  return FINAL_SUBMIT_MARKERS.some((marker) => postData.includes(marker));
}

function isInventoryMutationCandidate(request: Request): boolean {
  return inventoryMutationKind(request) !== null;
}

function inventoryMutationKind(
  request: Request,
): "category-selection" | "cabin-selection" | null {
  if (request.method() !== "POST") return null;
  try {
    const pathname = new URL(request.url()).pathname.toLowerCase();
    if (pathname === INVENTORY_MUTATION_CANDIDATE_PATHS[0]) return "category-selection";
    if (pathname === INVENTORY_MUTATION_CANDIDATE_PATHS[1]) return "cabin-selection";
    return null;
  } catch {
    return null;
  }
}

function shouldCapture(request: Request): boolean {
  try {
    const parsed = new URL(request.url());
    return isAllowedHost(parsed.hostname) && CAPTURED_RESOURCE_TYPES.includes(request.resourceType());
  } catch {
    return false;
  }
}

async function capturePageSchema(page: Page, outputDirectory: string, sequence: number): Promise<void> {
  const snapshot = await page.evaluate((): PageSnapshot => {
    const forms = Array.from(document.forms).map((form): FormSnapshot => {
      const fields = Array.from(form.elements).map((element): FormFieldSnapshot => {
        const field = element as HTMLInputElement;
        return {
          tag: field.tagName.toLowerCase(),
          type: field.type || "",
          name: field.name || "",
          id: field.id || "",
          required: Boolean(field.required),
          disabled: Boolean(field.disabled),
          dataOdyId: field.getAttribute("data-ody-id") || "",
        };
      });

      return {
        method: form.method || "GET",
        action: form.action,
        fields,
      };
    });

    return {
      capturedAt: new Date().toISOString(),
      url: window.location.href,
      title: "[redacted]",
      forms,
    };
  });

  snapshot.url = sanitizeUrl(snapshot.url);
  for (const form of snapshot.forms) form.action = sanitizeUrl(form.action);

  const fileName = `page-${String(sequence).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(outputDirectory, fileName), JSON.stringify(snapshot, null, 2));
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: npx tsx scripts/capture-odysseus-http-flow.ts [--url <package-url>] [--output <directory>] [--allow-category-selection] [--allow-cabin-selection]",
    );
    return;
  }

  const packageUrl = readOption("--url") ?? DEFAULT_PACKAGE_URL;
  const allowCategorySelection = process.argv.includes("--allow-category-selection");
  const allowCabinSelection = process.argv.includes("--allow-cabin-selection");
  const parsedPackageUrl = new URL(packageUrl);
  if (!isAllowedHost(parsedPackageUrl.hostname)) {
    throw new Error("The capture URL must use an approved Cruise Brothers/Odysseus host.");
  }

  const outputDirectory =
    readOption("--output") ?? path.join(DEFAULT_CAPTURE_ROOT, makeTimestamp());
  fs.mkdirSync(outputDirectory, { recursive: true });
  const eventFile = path.join(outputDirectory, "events.jsonl");

  const appendEvent = (event: CaptureEvent): void => {
    fs.appendFileSync(eventFile, `${JSON.stringify(event)}\n`);
  };

  const browser = await chromium.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
    viewport: { width: 430, height: 932 },
  });
  await context.addInitScript(
    "window.__name = window.__name || function (f) { return f; }; window.__publicField = window.__publicField || function (o,k,v) { o[k] = v; return v; };",
  );

  const requestIds = new WeakMap<Request, number>();
  const monitoredPages = new WeakSet<Page>();
  let requestSequence = 0;
  let pageSequence = 0;
  let transmittedCabinSelections = 0;
  let stopped = false;

  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    if (isPaymentSubmission(request)) {
      console.log("[SAFETY] Blocked the final Make Payment / Complete Reservation submission.");
      await route.abort("blockedbyclient");
      return;
    }
    const mutationKind = inventoryMutationKind(request);
    const mutationAllowed =
      (mutationKind === "category-selection" && allowCategorySelection) ||
      (mutationKind === "cabin-selection" && allowCabinSelection);
    if (mutationKind !== null && !mutationAllowed) {
      console.log(
        `[SAFETY] Blocked ${mutationKind} candidate: ${request.method()} ${sanitizeUrl(request.url())}`,
      );
      console.log(`Restart with --allow-${mutationKind} only after explicit approval.`);
      await route.abort("blockedbyclient");
      return;
    }
    if (mutationKind === "cabin-selection") {
      if (transmittedCabinSelections >= 1) {
        console.log("[SAFETY] Blocked an additional cabin-selection POST.");
        await route.abort("blockedbyclient");
        return;
      }
      transmittedCabinSelections += 1;
      console.log("[SAFETY] Allowing the single explicitly approved cabin-selection POST.");
    }
    await route.continue();
  });

  const attachMonitoring = (page: Page): void => {
    if (monitoredPages.has(page)) return;
    monitoredPages.add(page);

    page.on("request", (request) => {
      if (!shouldCapture(request)) return;
      const id = ++requestSequence;
      const paymentSubmissionBlocked = isPaymentSubmission(request);
      const mutationKind = inventoryMutationKind(request);
      const inventoryMutationCandidate = mutationKind !== null;
      requestIds.set(request, id);
      appendEvent({
        kind: "request",
        at: new Date().toISOString(),
        id,
        method: request.method(),
        url: sanitizeUrl(request.url()),
        resourceType: request.resourceType(),
        isNavigationRequest: request.isNavigationRequest(),
        headerNames: Object.keys(request.headers()).sort(),
        body: paymentSubmissionBlocked ? { omitted: "payment-boundary" } : describeRequestBody(request),
        paymentSubmissionBlocked,
        inventoryMutationCandidate,
        inventoryMutationKind: mutationKind,
      });
      console.log(`[REQ ${id}] ${request.method()} ${sanitizeUrl(request.url())}`);
    });

    page.on("response", (response: Response) => {
      const request = response.request();
      if (!shouldCapture(request)) return;
      appendEvent({
        kind: "response",
        at: new Date().toISOString(),
        requestId: requestIds.get(request) ?? null,
        url: sanitizeUrl(response.url()),
        status: response.status(),
        contentType: response.headers()["content-type"] ?? "",
      });
    });

    page.on("domcontentloaded", async () => {
      if (page.isClosed()) return;
      pageSequence += 1;
      const currentSequence = pageSequence;
      try {
        appendEvent({
          kind: "navigation",
          at: new Date().toISOString(),
          url: sanitizeUrl(page.url()),
          title: "[redacted]",
        });
        await capturePageSchema(page, outputDirectory, currentSequence);
        console.log(`[PAGE ${currentSequence}] ${sanitizeUrl(page.url())}`);
      } catch (error) {
        console.warn("[Monitor] Could not snapshot the page:", error instanceof Error ? error.message : error);
      }
    });
  };

  context.on("page", attachMonitoring);
  const page = await context.newPage();
  attachMonitoring(page);

  const stop = async (detail: string): Promise<void> => {
    if (stopped) return;
    stopped = true;
    appendEvent({ kind: "capture-stopped", at: new Date().toISOString(), detail });
    console.log(`Capture saved to: ${outputDirectory}`);
    await browser.close();
  };

  process.once("SIGINT", () => {
    void stop("Operator stopped capture with Ctrl+C");
  });

  browser.once("disconnected", () => {
    if (!stopped) {
      stopped = true;
      appendEvent({
        kind: "capture-stopped",
        at: new Date().toISOString(),
        detail: "Browser was closed",
      });
      console.log(`Capture saved to: ${outputDirectory}`);
    }
  });

  appendEvent({
    kind: "capture-started",
    at: new Date().toISOString(),
    detail: "Manual capture started. Final payment submission is blocked.",
  });

  console.log("Odysseus HTTP capture is active in a mobile-sized Chrome window.");
  console.log("Navigate manually only as far as the payment form. Do not enter card data.");
  console.log("The known final booking/payment submit is blocked as an additional safeguard.");
  console.log(
    allowCategorySelection
      ? "Category-selection POSTs are enabled for this explicitly armed run."
      : "Category-selection POSTs are blocked.",
  );
  console.log(
    allowCabinSelection
      ? "One cabin-selection POST is enabled for this explicitly armed run."
      : "Cabin-selection POSTs are blocked.",
  );
  console.log("Close the browser or press Ctrl+C in this terminal when finished.");
  console.log(`Sanitized output directory: ${outputDirectory}`);

  const browserDisconnected = new Promise<void>((resolve) =>
    browser.once("disconnected", () => resolve()),
  );

  try {
    await page.goto(packageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await browserDisconnected;
  } catch (error) {
    await stop("Capture ended after a browser or navigation error");
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
