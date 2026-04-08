/**
 * Maps port/airport codes (as returned by CB group inventory) to human-readable
 * city + region labels. Falls back to the raw code if not found.
 *
 * Covers all major cruise homeports used by the big lines globally.
 */
export const CRUISE_PORT_NAMES: Record<string, string> = {
    // ── North America – East Coast & Gulf ─────────────────────────────────────
    MIA: 'Miami, FL',
    FLL: 'Fort Lauderdale, FL',
    MCO: 'Orlando (Port Canaveral), FL',
    TPA: 'Tampa, FL',
    JAX: 'Jacksonville, FL',
    MSY: 'New Orleans, LA',
    GAL: 'Galveston, TX',
    HOU: 'Houston, TX',
    BWI: 'Baltimore, MD',
    NYC: 'New York, NY',
    JFK: 'New York, NY',
    EWR: 'New York (Bayonne), NJ',
    BOS: 'Boston, MA',
    NFK: 'Norfolk, VA',
    CLT: 'Charleston, SC',
    // ── North America – West Coast & Alaska ───────────────────────────────────
    SEA: 'Seattle, WA',
    YVR: 'Vancouver, BC',
    SFO: 'San Francisco, CA',
    LAX: 'Los Angeles, CA',
    SAN: 'San Diego, CA',
    // ── Alaska ports ──────────────────────────────────────────────────────────
    JNU: 'Juneau, AK',
    KTN: 'Ketchikan, AK',
    SIT: 'Sitka, AK',
    // ── Canada & New England ──────────────────────────────────────────────────
    YHZ: 'Halifax, NS',
    YQB: 'Quebec City, QC',
    // ── Caribbean ─────────────────────────────────────────────────────────────
    SJU: 'San Juan, PR',
    STT: 'St. Thomas, USVI',
    STX: 'St. Croix, USVI',
    SXM: 'St. Maarten',
    ANU: 'Antigua',
    BGI: 'Bridgetown, Barbados',
    POS: 'Port of Spain, Trinidad',
    GCM: 'Grand Cayman',
    MBJ: 'Montego Bay, Jamaica',
    KIN: 'Kingston, Jamaica',
    HAV: 'Havana, Cuba',
    NAS: 'Nassau, Bahamas',
    FPO: 'Freeport, Bahamas',
    CZM: 'Cozumel, Mexico',
    // ── Mexico ────────────────────────────────────────────────────────────────
    PVR: 'Puerto Vallarta, Mexico',
    ZIH: 'Ixtapa/Zihuatanejo, Mexico',
    MZT: 'Mazatlán, Mexico',
    HUX: 'Huatulco, Mexico',
    ACA: 'Acapulco, Mexico',
    // ── Europe – Mediterranean ────────────────────────────────────────────────
    BCN: 'Barcelona, Spain',
    MRS: 'Marseille, France',
    GEN: 'Genoa, Italy',
    FCO: 'Rome (Civitavecchia), Italy',
    NAP: 'Naples, Italy',
    VCE: 'Venice, Italy',
    TRS: 'Trieste, Italy',
    ATH: 'Athens (Piraeus), Greece',
    HER: 'Heraklion (Crete), Greece',
    RHO: 'Rhodes, Greece',
    CFU: 'Corfu, Greece',
    DBV: 'Dubrovnik, Croatia',
    SPU: 'Split, Croatia',
    KOP: 'Kotor, Montenegro',
    IST: 'Istanbul, Turkey',
    TLS: 'Toulon, France',
    LIS: 'Lisbon, Portugal',
    MAD: 'Málaga, Spain',
    VLC: 'Valencia, Spain',
    PMI: 'Palma de Mallorca, Spain',
    // ── Europe – Northern & Baltic ────────────────────────────────────────────
    LHR: 'London (Southampton), UK',
    SOU: 'Southampton, UK',
    TIL: 'Tilbury (London), UK',
    AMS: 'Amsterdam, Netherlands',
    CPH: 'Copenhagen, Denmark',
    OSL: 'Oslo, Norway',
    BGO: 'Bergen, Norway',
    ARN: 'Stockholm, Sweden',
    HEL: 'Helsinki, Finland',
    TLL: 'Tallinn, Estonia',
    RIX: 'Riga, Latvia',
    HAM: 'Hamburg, Germany',
    WAW: 'Gdańsk, Poland',
    // ── Scandinavia / Fjords ──────────────────────────────────────────────────
    TRD: 'Trondheim, Norway',
    TOS: 'Tromsø, Norway',
    LYR: 'Longyearbyen, Svalbard',
    // ── Asia-Pacific ──────────────────────────────────────────────────────────
    HKG: 'Hong Kong',
    SIN: 'Singapore',
    NRT: 'Tokyo (Yokohama), Japan',
    TYO: 'Tokyo (Yokohama), Japan',
    OSA: 'Osaka, Japan',
    SHA: 'Shanghai, China',
    BKK: 'Bangkok (Laem Chabang), Thailand',
    SYD: 'Sydney, Australia',
    MEL: 'Melbourne, Australia',
    BNE: 'Brisbane, Australia',
    AKL: 'Auckland, New Zealand',
    // ── Hawaii & Pacific ──────────────────────────────────────────────────────
    HNL: 'Honolulu, HI',
    // ── Middle East ───────────────────────────────────────────────────────────
    DXB: 'Dubai, UAE',
    AUH: 'Abu Dhabi, UAE',
    // ── South America ─────────────────────────────────────────────────────────
    GIG: 'Rio de Janeiro, Brazil',
    GRU: 'São Paulo (Santos), Brazil',
    EZE: 'Buenos Aires, Argentina',
    SCL: 'Santiago (Valparaíso), Chile',
    // ── Antarctica / Expedition ───────────────────────────────────────────────
    USH: 'Ushuaia, Argentina',
};

export function formatDeparturePort(code: string): string {
    return CRUISE_PORT_NAMES[code.toUpperCase()] ?? code;
}
