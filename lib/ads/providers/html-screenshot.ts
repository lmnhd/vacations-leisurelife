// lib/ads/providers/html-screenshot.ts
//
// Playwright-based HTML screenshot provider.
// Navigates to /ads/render/[slug]/[format], sets the viewport to the template's
// native pixel dimensions, and returns a PNG buffer.

import { chromium } from 'playwright';
import { TEMPLATE_DIMENSIONS } from '@/lib/ads/html-templates/core';
import type { AdFormat } from '@/lib/ads/types';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

// How long to wait after domcontentloaded before screenshotting.
// CSS background-image fetches (S3) happen after DOMContentLoaded and aren't
// tracked by Playwright's networkidle heuristic reliably — a fixed paint wait
// is more predictable than networkidle, which stalls indefinitely on retries.
const PAINT_SETTLE_MS = 800;
const NAV_TIMEOUT_MS  = 30_000;

export interface HtmlScreenshotResult {
    buffer: Buffer;
    width: number;
    height: number;
    format: AdFormat;
    renderUrl: string;
}

export async function screenshotHtmlTemplate(
    slug: string,
    format: AdFormat,
): Promise<HtmlScreenshotResult> {
    const dims = TEMPLATE_DIMENSIONS[format];
    if (!dims) {
        throw new Error(`No HTML template registered for format "${format}"`);
    }

    const { width, height } = dims;
    const renderUrl = `${APP_BASE_URL}/ads/render/${slug}/${format}`;

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setViewportSize({ width, height });
        await page.goto(renderUrl, {
            waitUntil: 'domcontentloaded',
            timeout: NAV_TIMEOUT_MS,
        });

        // Wait for every CSS background-image referenced in the rendered DOM
        // to finish loading. Playwright's `networkidle`/`load` heuristics do
        // NOT cover CSS-loaded images, so we have to drive this ourselves.
        await page.evaluate(async () => {
            const urls = new Set<string>();
            for (const el of document.querySelectorAll<HTMLElement>('*')) {
                const bg = getComputedStyle(el).backgroundImage;
                if (!bg || bg === 'none') continue;
                // Match every url("...") fragment — there can be multiple per layer.
                for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
                    urls.add(m[1]);
                }
            }
            await Promise.all(Array.from(urls).map((url) => new Promise<void>((resolve) => {
                const img = new Image();
                img.onload  = () => resolve();
                img.onerror = () => resolve(); // resolve on error too — we don't want to block forever
                img.src = url;
            })));
        });

        // Small extra settle so the painted images compositing finishes.
        await page.waitForTimeout(PAINT_SETTLE_MS);

        const buffer = await page.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width, height },
        });

        return { buffer, width, height, format, renderUrl };
    } finally {
        await browser.close();
    }
}

export async function screenshotAllHtmlTemplates(
    slug: string,
    formats: readonly AdFormat[],
    onProgress?: (format: AdFormat, index: number, total: number) => void,
): Promise<HtmlScreenshotResult[]> {
    const supported = formats.filter((f) => TEMPLATE_DIMENSIONS[f] !== undefined);
    const results: HtmlScreenshotResult[] = [];

    for (let i = 0; i < supported.length; i++) {
        const format = supported[i];
        onProgress?.(format, i, supported.length);
        results.push(await screenshotHtmlTemplate(slug, format));
    }

    return results;
}

export const HTML_SCREENSHOT_SUPPORTED_FORMATS = Object.keys(TEMPLATE_DIMENSIONS) as AdFormat[];
