import { z } from 'zod';

// ─── Shared Cruise Brothers knowledge-cache schema ──────────────────────────────
//
// Single source of truth for the `cb-knowledge-cache.json` entry shape, shared by
// the authenticated ingester (`scripts/ingest-cbagenttools.ts`), the retrieval
// tool (`lib/chat/tools/cruise-brothers-knowledge.ts`), the freshness checker, and
// the deterministic retrieval tests.
//
// The July 2026 ingestion expansion adds attribution and freshness metadata so the
// operator copilot can separate confirmed, dated agency guidance from stale or
// authority-unclear material. Every new field is optional so the ~111 pre-existing
// vendor-directory entries continue to parse unchanged.

/**
 * Coarse classification of what an entry answers. Drives deterministic retrieval
 * tests and lets the copilot pick the right talk track (e.g. insurance vs flight).
 */
export const KNOWLEDGE_SECTION_KINDS = [
    'vendor',
    'promotion',
    'insurance',
    'deposit',
    'refund',
    'cancellation',
    'flight',
    'training',
    'agency',
    'other',
] as const;

export type KnowledgeSectionKind = (typeof KNOWLEDGE_SECTION_KINDS)[number];

/** The document format an entry was extracted from. */
export const KNOWLEDGE_DOC_TYPES = ['page', 'table', 'pdf', 'directory'] as const;

export type KnowledgeDocType = (typeof KNOWLEDGE_DOC_TYPES)[number];

export const KnowledgeEntrySchema = z.object({
    title: z.string(),
    content: z.string(),
    source: z.string().optional(),
    url: z.string().optional(),
    tags: z.array(z.string()).optional(),

    // ── Expansion metadata (all optional for backward compatibility) ──
    /** Supplier / cruise line / insurer the entry is attributable to, when known. */
    supplier: z.string().optional(),
    /** Jurisdiction the entry applies to, e.g. a US state code, "US", or "ALL". */
    jurisdiction: z.string().optional(),
    /** Section classification used by retrieval tests and copilot talk tracks. */
    sectionKind: z.enum(KNOWLEDGE_SECTION_KINDS).optional(),
    /** Extraction format so tables and linked PDFs stay separately attributable. */
    docType: z.enum(KNOWLEDGE_DOC_TYPES).optional(),
    /** Effective / published date printed on the source page, when discoverable. */
    effectiveDate: z.string().optional(),
    /** ISO timestamp of when this entry was retrieved from the authenticated portal. */
    retrievedAtIso: z.string().optional(),
});

export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

export const KnowledgeCacheSchema = z.union([
    z.array(KnowledgeEntrySchema),
    z.object({
        generatedAtIso: z.string().optional(),
        entries: z.array(KnowledgeEntrySchema),
    }),
]);

export type KnowledgeCache = z.infer<typeof KnowledgeCacheSchema>;

/** Normalizes either cache shape to a flat entry array. */
export function entriesFromCache(cache: KnowledgeCache): KnowledgeEntry[] {
    return Array.isArray(cache) ? cache : cache.entries;
}

/**
 * Days after which a dated entry is considered stale for freshness reporting.
 * Policy/insurance/flight content changes often; agency contact info rarely does.
 */
export const FRESHNESS_MAX_AGE_DAYS: Record<KnowledgeSectionKind, number> = {
    insurance: 30,
    deposit: 45,
    refund: 45,
    cancellation: 45,
    flight: 30,
    promotion: 14,
    training: 120,
    agency: 180,
    vendor: 180,
    other: 90,
};

/**
 * Returns the effective age anchor for an entry: prefer the source's own
 * effective/published date, else the retrieval timestamp. Returns null when the
 * entry carries no date at all (legacy entries), which callers treat as unknown.
 */
export function entryDateAnchor(entry: KnowledgeEntry): Date | null {
    const raw = entry.effectiveDate ?? entry.retrievedAtIso;
    if (!raw) {
        return null;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Deterministic keyword + facet retrieval over knowledge entries.
 *
 * The production retrieval tool (`cruise-brothers-knowledge.ts`) uses an LLM for
 * final selection, but that is non-deterministic and untestable offline. This
 * pure function is the deterministic floor the ingestion pipeline guarantees: for
 * an insurance/deposit/refund/cancellation/flight question against a well-formed
 * cache, the correctly-classified entries must be retrievable by keyword and
 * section kind alone. The retrieval tests assert against this so a bad ingest
 * (missing metadata, wrong classification) fails deterministically in CI.
 */
export function retrieveByKeyword(
    query: string,
    entries: KnowledgeEntry[],
    options: { limit?: number; jurisdiction?: string } = {}
): KnowledgeEntry[] {
    const limit = options.limit ?? 3;
    const terms = query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3);
    if (terms.length === 0) {
        return [];
    }

    // Terms that also name a section kind steer a facet bonus.
    const impliedKinds = new Set<KnowledgeSectionKind>();
    for (const kind of KNOWLEDGE_SECTION_KINDS) {
        if (terms.some((term) => kind.startsWith(term) || term.startsWith(kind))) {
            impliedKinds.add(kind);
        }
    }

    const scored = entries
        .map((entry) => {
            const haystack = [
                entry.title,
                entry.content,
                entry.sectionKind ?? '',
                entry.supplier ?? '',
                entry.jurisdiction ?? '',
                ...(entry.tags ?? []),
            ]
                .join(' ')
                .toLowerCase();

            let score = terms.reduce((sum, term) => (haystack.includes(term) ? sum + 1 : sum), 0);
            if (score === 0) {
                return null;
            }
            // Facet bonuses: matching section kind and requested jurisdiction.
            if (entry.sectionKind && impliedKinds.has(entry.sectionKind)) {
                score += 3;
            }
            if (
                options.jurisdiction &&
                entry.jurisdiction &&
                entry.jurisdiction.toLowerCase() === options.jurisdiction.toLowerCase()
            ) {
                score += 2;
            }
            return { entry, score };
        })
        .filter((match): match is { entry: KnowledgeEntry; score: number } => match !== null)
        .sort((left, right) => right.score - left.score);

    return scored.slice(0, limit).map((match) => match.entry);
}

/**
 * Deterministic staleness decision used by both the freshness script and tests.
 * An entry with no usable date is reported as `unknown` (not stale, not fresh).
 */
export function assessFreshness(
    entry: KnowledgeEntry,
    now: Date = new Date()
): { state: 'fresh' | 'stale' | 'unknown'; ageDays: number | null; maxAgeDays: number } {
    const kind = entry.sectionKind ?? 'other';
    const maxAgeDays = FRESHNESS_MAX_AGE_DAYS[kind];
    const anchor = entryDateAnchor(entry);
    if (!anchor) {
        return { state: 'unknown', ageDays: null, maxAgeDays };
    }
    const ageDays = Math.floor((now.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000));
    return {
        state: ageDays > maxAgeDays ? 'stale' : 'fresh',
        ageDays,
        maxAgeDays,
    };
}
