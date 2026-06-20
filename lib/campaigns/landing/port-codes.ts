/**
 * lib/campaigns/landing/port-codes.ts
 *
 * Shared port-code → human-readable city name lookup.
 * Used by the view model (display) and Phase B (storage-time resolution).
 *
 * Covers IATA airport codes used as cruise departure codes, plus common
 * Royal Caribbean / CB internal codes. Unknown codes fall through to null
 * so callers can decide whether to hide or pass-through raw values.
 */

export const PORT_CODES: Readonly<Record<string, string>> = {
    // ── US East Coast & Gulf ─────────────────────────────────────────────────
    MIA: 'Miami, FL',
    FLL: 'Fort Lauderdale, FL',
    MCO: 'Orlando (Port Canaveral), FL',
    XPC: 'Port Canaveral, FL',
    TPA: 'Tampa, FL',
    JAX: 'Jacksonville, FL',
    MSY: 'New Orleans, LA',
    NOR: 'New Orleans, LA',
    NYC: 'New York, NY',
    EWR: 'New York (Bayonne), NJ',
    BAL: 'Baltimore, MD',
    BOS: 'Boston, MA',
    NOR2: 'Norfolk, VA',
    CHN: 'Charleston, SC',
    SAV: 'Savannah, GA',
    GAL: 'Galveston, TX',
    HOU: 'Houston, TX',
    // ── US West Coast & Pacific ──────────────────────────────────────────────
    SEA: 'Seattle, WA',
    SFO: 'San Francisco, CA',
    LAX: 'Los Angeles, CA',
    SAN: 'San Diego, CA',
    HNL: 'Honolulu, HI',
    ANC: 'Anchorage (Seward), AK',
    // ── Caribbean ────────────────────────────────────────────────────────────
    SJU: 'San Juan, Puerto Rico',
    STT: 'St. Thomas, USVI',
    STX: 'St. Croix, USVI',
    SXM: 'St. Maarten',
    ANU: 'Antigua',
    BGI: 'Barbados',
    SKB: 'St. Kitts',
    STL: 'St. Lucia',
    SVD: 'St. Vincent',
    GND: 'Grenada',
    PTP: 'Guadeloupe',
    FDF: 'Martinique',
    DOM: 'Dominica',
    NAS: 'Nassau, Bahamas',
    FPO: 'Freeport, Bahamas',
    MHH: 'Marsh Harbour, Bahamas',
    GCM: 'Grand Cayman',
    CZM: 'Cozumel, Mexico',
    ROR: 'Roatan, Honduras',
    BTB: 'Belize City, Belize',
    MBJ: 'Montego Bay, Jamaica',
    KIN: 'Kingston, Jamaica',
    OCJ: 'Ocho Rios, Jamaica',
    HAV: 'Havana, Cuba',
    SDQ: 'Santo Domingo, Dominican Republic',
    PUJ: 'Punta Cana, Dominican Republic',
    ARU: 'Aruba',
    BON: 'Bonaire',
    CUR: 'Curaçao',
    TCI: 'Turks & Caicos',
    // ── Canada ───────────────────────────────────────────────────────────────
    YVR: 'Vancouver, BC',
    YHZ: 'Halifax, NS',
    QBC: 'Quebec City, QC',
    // ── Europe ───────────────────────────────────────────────────────────────
    SOU: 'Southampton, UK',
    BCN: 'Barcelona, Spain',
    ROM: 'Rome (Civitavecchia), Italy',
    VEN: 'Venice, Italy',
    ATH: 'Athens (Piraeus), Greece',
    DUB: 'Dubai, UAE',
    // ── Alaska / Pacific Northwest ───────────────────────────────────────────
    JNU: 'Juneau, AK',
    KTN: 'Ketchikan, AK',
    SIT: 'Sitka, AK',
    SKA: 'Skagway, AK',
    GST: 'Glacier Bay, AK',
    // ── Asia / Pacific ───────────────────────────────────────────────────────
    SYD: 'Sydney, Australia',
    MEL: 'Melbourne, Australia',
    AKL: 'Auckland, New Zealand',
    HKG: 'Hong Kong',
    SIN: 'Singapore',
    BKK: 'Bangkok (Laem Chabang), Thailand',
    // ── Panama Canal / Pacific South America ─────────────────────────────────
    PNMC: 'Panama Canal Transit',
    GYE: 'Guayaquil, Ecuador',
    BLVR: 'Puerto Bolívar, Ecuador',
    CALL: 'Callao (Lima), Peru',
    GSM1: 'General San Martín (Paracas), Peru',
    IQQ: 'Iquique, Chile',
    // ── South Pacific / French Polynesia ─────────────────────────────────────
    IPC: 'Easter Island (Isla de Pascua), Chile',
    AUQ: 'Atuona (Hiva Oa), Marquesas, French Polynesia',
    FAV: 'Fakarava, Tuamotus, French Polynesia',
    PPT: 'Papeete, Tahiti, French Polynesia',
    // Best-guess mappings — verify against the Odysseus itinerary before treating
    // as authoritative (geographically inferred from the surrounding route):
    '8048': 'Fuerte Amador (Panama City), Panama', // numeric internal code, post-Canal call
    THAE: 'Mangareva (Gambier Islands), French Polynesia',
    AVTR: 'Avatoru (Rangiroa), Tuamotus, French Polynesia',
    // ── Common CB / Royal Caribbean internal codes ───────────────────────────
    MET: 'At Sea',          // CB internal: "sea day" waypoint
    SEA2: 'At Sea',
    CRU: 'Cruising',
};

/**
 * Resolve a 2–4 char port code to a human-readable city name.
 * Returns null when the code is not in the registry so callers can decide
 * how to handle unknown codes rather than showing raw uppercase strings.
 */
export function resolvePortCode(code: string): string | null {
    return PORT_CODES[code.toUpperCase().trim()] ?? null;
}

/**
 * Format a pipe-separated ports-of-call string (e.g. "SJU|MET|SXM|SJU")
 * into a readable list, resolving known codes and filtering out unresolvable
 * ones that would be meaningless to a guest.
 *
 * Returns null when no codes could be resolved (caller should hide the field).
 */
export function formatPortsOfCall(raw: string): string | null {
    if (!raw.trim()) return null;

    const codes = raw.split(/[|,]/).map((c) => c.trim()).filter(Boolean);

    // Deduplicate while preserving first-occurrence order
    const seen = new Set<string>();
    const resolved: string[] = [];
    for (const code of codes) {
        const name = resolvePortCode(code);
        const display = name ?? (code.length > 4 ? code : null); // keep long values as-is; drop short unresolved codes
        if (display && !seen.has(display.toLowerCase())) {
            seen.add(display.toLowerCase());
            resolved.push(display);
        }
    }

    return resolved.length > 0 ? resolved.join(' · ') : null;
}

/**
 * Format a raw departure/arrival port code for guest display.
 * Falls back to the raw code if not found (it's usually readable enough
 * as a city abbreviation; e.g. "SJU" is better than nothing when unlisted).
 */
export function formatDepartureLeg(code: string): string {
    return resolvePortCode(code) ?? code.toUpperCase();
}
