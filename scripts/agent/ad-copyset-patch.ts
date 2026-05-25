/**
 * Agent-safe ad copy-set patcher - no Playwright, no HTTP, no LLM.
 *
 * Usage:
 *   npx tsx scripts/agent/ad-copyset-patch.ts <input-json> <output-json> <format> <page-index> <field> <value...>
 *
 * The input may be either a full Copy Forge response ({ copySet: ... }) or a
 * raw AdCopySet. Page index is zero-based. Use 0 for single-page formats.
 */

import * as fs from 'fs';
import * as path from 'path';

const EDITABLE_FIELDS = new Set(['headline', 'subhead', 'microcopy', 'cta']);

function readJson(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf-8'));
}

function writeJson(filePath: string, value: unknown): void {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function main(): void {
    const [inputPath, outputPath, format, pageIndexRaw, field, ...valueParts] = process.argv.slice(2);
    const value = valueParts.join(' ');

    if (!inputPath || !outputPath || !format || pageIndexRaw === undefined || !field || valueParts.length === 0) {
        console.error('Usage: npx tsx scripts/agent/ad-copyset-patch.ts <input-json> <output-json> <format> <page-index> <field> <value...>');
        process.exit(1);
    }
    if (!EDITABLE_FIELDS.has(field)) {
        console.error(`Field must be one of: ${Array.from(EDITABLE_FIELDS).join(', ')}`);
        process.exit(1);
    }

    const pageIndex = Number(pageIndexRaw);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
        console.error('page-index must be a zero-based integer.');
        process.exit(1);
    }

    const document = readJson(inputPath) as Record<string, unknown>;
    const copySet = ('copySet' in document ? document.copySet : document) as {
        formats?: Record<string, unknown>;
    };
    const pack = copySet.formats?.[format];
    if (!pack) {
        console.error(`No copy pack found for format "${format}".`);
        process.exit(1);
    }

    if (Array.isArray(pack)) {
        if (!pack[pageIndex] || typeof pack[pageIndex] !== 'object') {
            console.error(`No page index ${pageIndex} found for carousel/multipage format "${format}".`);
            process.exit(1);
        }
        pack[pageIndex] = { ...(pack[pageIndex] as Record<string, unknown>), [field]: value };
    } else if (typeof pack === 'object') {
        if (pageIndex !== 0) {
            console.error(`Format "${format}" is single-page. Use page-index 0.`);
            process.exit(1);
        }
        copySet.formats![format] = { ...(pack as Record<string, unknown>), [field]: value };
    } else {
        console.error(`Copy pack for "${format}" is not an editable object.`);
        process.exit(1);
    }

    writeJson(outputPath, document);
    console.log(JSON.stringify({
        ok: true,
        inputPath: path.resolve(inputPath),
        outputPath: path.resolve(outputPath),
        format,
        pageIndex,
        field,
        value,
    }, null, 2));
}

main();
