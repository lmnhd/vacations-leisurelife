export interface DealsSystemOperatorAction {
  id: string;
  npmScript: string;
  label: string;
  description: string;
  category: "safe_test" | "data_refresh";
  writesCache: boolean;
  requiresPortalSession: boolean;
  usesLlm: boolean;
  timeoutMs: number;
}

export const DEALS_SYSTEM_OPERATOR_ACTIONS = [
  {
    id: "deals-schema",
    npmScript: "test:deals-schema",
    label: "Schema and cache gates",
    description: "Validate all Deals cache files and the no-public-deal-without-valid-link gate.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "link-broker",
    npmScript: "test:link-broker",
    label: "Link Broker contracts",
    description: "Run deterministic Link Broker construction and decision tests.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "link-health",
    npmScript: "test:link-broker-health",
    label: "Link health logic",
    description: "Validate stale, broken, unknown, and valid link-health behavior.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "promo-extraction",
    npmScript: "test:promo-extraction",
    label: "Promo extraction",
    description: "Check CB promo extraction and marketing-use parsing rules.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "package-lookup",
    npmScript: "test:package-lookup",
    label: "Package lookup",
    description: "Validate package lookup matching and ambiguity handling.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "retail-research",
    npmScript: "test:retail-discovery-research",
    label: "Retail research",
    description: "Check Group Discovery to retail Deal angle and targeting resource adapters.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "deal-pitch-brief",
    npmScript: "test:deal-pitch-brief",
    label: "Sales pitch brief (Phase 9B)",
    description:
      "Verify pitch brief generation, customer-voice enforcement, researchRationale isolation, and copy dependency on the pitch brief.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "curated-deal-assembly",
    npmScript: "test:curated-deal-assembly",
    label: "Curated Deal assembly + approval gate",
    description:
      "Verify Deal assembly, staged copy/ad/media generation, and that a valid link alone never publishes a Deal without operator approval.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 120_000,
  },
  {
    id: "all-safe",
    npmScript: "test:deals-system:all",
    label: "Run all safe Deals tests",
    description: "Run the full safe Deals validation suite. This does not run build or CBAT scraping.",
    category: "safe_test",
    writesCache: false,
    requiresPortalSession: false,
    usesLlm: false,
    timeoutMs: 420_000,
  },
  {
    id: "scrape-promo-intelligence",
    npmScript: "scrape-cb-promo-intelligence",
    label: "Refresh CB promo intelligence",
    description:
      "Scrape CB Agent Tools Today's View into cb-promo-intelligence-cache.json. Requires a valid CBAT session or credentials.",
    category: "data_refresh",
    writesCache: true,
    requiresPortalSession: true,
    usesLlm: false,
    timeoutMs: 360_000,
  },
  {
    id: "extract-promo-intelligence",
    npmScript: "extract-cb-promo-intelligence",
    label: "Extract promo intelligence",
    description:
      "Run GPT extraction over cached promo text and write structured offer, marketing, and caution fields back to the cache.",
    category: "data_refresh",
    writesCache: true,
    requiresPortalSession: false,
    usesLlm: true,
    timeoutMs: 600_000,
  },
] as const satisfies DealsSystemOperatorAction[];

export type DealsSystemOperatorActionId = (typeof DEALS_SYSTEM_OPERATOR_ACTIONS)[number]["id"];

export function getDealsSystemOperatorAction(
  id: string
): DealsSystemOperatorAction | undefined {
  return DEALS_SYSTEM_OPERATOR_ACTIONS.find((action) => action.id === id);
}
