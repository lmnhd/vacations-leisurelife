import axios from 'axios';
import { load } from 'cheerio';
import path from 'path';
import { readFileSync } from 'fs';

// VTG cruise line codes for the `l` param — extracted from live VTG form
export const VTG_CRUISE_LINE_CODES: Record<string, number> = {
    'all': 0,
    'Carnival': 8,
    'Celebrity': 11,
    'Crystal': 13,
    'Disney': 16,
    'Holland America': 5,
    'Norwegian': 17,
    'Princess': 3,
    'Royal Caribbean': 14,
    'Seabourn': 19,
    'Cunard': 6,
    'Oceania': 47,
    'Costa': 12,
    'MSC': 41,
    'Azamara': 55,
    'Silversea': 20,
    'Regent Seven Seas': 18,
    'Viking': 45,
    'Virgin Voyages': 122,
    'Windstar': 15,
    'Hurtigruten': 58,
};

// VTG region codes for the `r` param — extracted from live VTG form
export const VTG_REGION_CODES: Record<string, number> = {
    'all': 0,
    'Bahamas': 30,
    'Caribbean': 13,
    'Caribbean (Eastern)': 42,
    'Caribbean (Western)': 44,
    'Caribbean (Southern)': 43,
    'Alaska': 9,
    'Hawaii': 21,
    'Europe': 71,
    'Mediterranean': 11,
    'Mediterranean (Eastern)': 91,
    'Mediterranean (Western)': 90,
    'South America': 25,
    'Panama Canal': 14,
    'Asia': 17,
    'Australia': 15,
    'Africa': 16,
    'Canada/New England': 19,
    'Transatlantic': 26,
    'Transpacific': 34,
    'Bermuda': 18,
    'Mexico': 22,
    'Norway': 81,
    'Greek Islands': 37,
};

export type VtgSearchInput = {
    cruiseLine: string | null;   // cruise line name — use VTG_CRUISE_LINE_CODES
    region: string | null;       // destination region — use VTG_REGION_CODES
    minNights: number | null;    // minimum nights (4, 7, 10, 14...)
    maxNights: number | null;    // maximum nights
    startMonth: string | null;   // YYYYMM format e.g. "202604"
    endMonth: string | null;     // YYYYMM format e.g. "202606"
    passengers: number;          // number of guests
};

export type VtgDeal = {
    region: string;
    nights: string;
    fromPort: string;
    toPort: string;
    cruiseLine: string;
    ship: string;
    date: string;
    rating: string;
    brochurePrice: string;
    ourPrice: string;
    youSave: string;
    status: string;
    dealId: string;
    shipId: string;
};

export type VtgSearchOutput = {
    searchSummary: string;
    results: VtgDeal[];
};

function getCookie(): string {
    const cookiefile = path.join(process.cwd(), '/app/api/vtgSearch/cookies.json');
    const raw = readFileSync(cookiefile, 'utf-8');
    const cookies = JSON.parse(raw) as Array<{ name: string; value: string }>;
    // Build cookie string from all entries in the file
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

function resolveCode(map: Record<string, number>, key: string | null): number {
    if (!key) return 0;
    const normalized = key.trim().toLowerCase();
    const entry = Object.entries(map).find(([k]) => k.toLowerCase() === normalized);
    return entry ? entry[1] : 0;
}

function buildVtgUrl(input: VtgSearchInput): string {
    const l = resolveCode(VTG_CRUISE_LINE_CODES, input.cruiseLine); // cruise line filter
    const r = resolveCode(VTG_REGION_CODES, input.region);          // region filter

    const now = new Date();
    // VTG month format: YYYYM (e.g. April 2026 = 20264, Oct 2026 = 202610)
    const toVtgMonth = (d: Date) => `${d.getFullYear()}${d.getMonth() + 1}`;
    const futureDate = new Date(now.getFullYear(), now.getMonth() + 4, 1);

    // Accept YYYYMM (6-digit) from LLM and convert to VTG's YYYYM format
    const normalizeMonth = (m: string) => {
        if (m.length === 6) return `${m.slice(0, 4)}${parseInt(m.slice(4), 10)}`;
        return m;
    };

    const sm = input.startMonth ? normalizeMonth(input.startMonth) : toVtgMonth(now);
    const tm = input.endMonth ? normalizeMonth(input.endMonth) : toVtgMonth(futureDate);

    const minNights = input.minNights ?? 0;

        // n = nights bucket: 0=any, 1=3-6, 2=7, 3=8-13, 4=14+, 5=21+
    let nightsBucket = 0;
    if (minNights !== null && minNights > 0) {
        if (minNights >= 21) nightsBucket = 5;
        else if (minNights >= 14) nightsBucket = 4;
        else if (minNights >= 8) nightsBucket = 3;
        else if (minNights >= 7) nightsBucket = 2;
        else nightsBucket = 1;
    }

    return `https://www.vacationstogo.com/ticker.cfm?incCT=y&sm=${sm}&tm=${tm}&r=${r}&l=${l}&s=0&n=${nightsBucket}&d=0&v=0&rt=1`;
}

function parseDealsHtml(html: string): VtgDeal[] {
    const $ = load(html);
    const deals: VtgDeal[] = [];

    const allRegions = $('table.region');
    const allDeals = $('table.deals');

    allDeals.each((index, dealTable) => {
        const regionName = $(allRegions[index]).find('a').text().trim();
        const rows = $(dealTable).find('tbody tr');

        rows.each((_, row) => {
            const portId = $(row).find('.d > a').attr('href')?.match(/\d+/g)?.[0] ?? '';
            const shipId = $(row).find('.ls > a:last').attr('href')?.match(/\d+/g)?.[0] ?? '';

            deals.push({
                region: regionName,
                nights: $(row).find('.n').text().trim(),
                fromPort: $(row).find('.d > a').text().trim(),
                toPort: $(row).find('.e > a').text().trim(),
                cruiseLine: $(row).find('.ls > a:first').text().trim(),
                ship: $(row).find('.ls > a:last').text().trim(),
                date: $(row).find('.dt').text().trim(),
                rating: $(row).find('.r').text().trim(),
                brochurePrice: $(row).find('.br').text().trim(),
                ourPrice: $(row).find('.our').text().trim(),
                youSave: $(row).find('.p').text().trim(),
                status: $(row).find('.st').text().trim(),
                dealId: portId,
                shipId,
            });
        });
    });

    return deals;
}

export async function runVtgSearch(input: VtgSearchInput): Promise<VtgSearchOutput> {
    const cookie = getCookie();
    const url = buildVtgUrl(input);

    console.log('[vtg-search] Fetching:', url);

    const response = await axios.get<string>(url, {
        headers: { Cookie: cookie },
        timeout: 10000,
    });

    const $ = load(response.data);
    const hasDeals = $('.deals').length > 0;

    if (!hasDeals) {
        return {
            searchSummary: 'No VTG deals found matching that criteria.',
            results: [],
        };
    }

    const results = parseDealsHtml($.html() ?? '');

    return {
        searchSummary: `Found ${results.length} VTG deals across ${[...new Set(results.map(r => r.region))].length} regions.`,
        results: results.slice(0, 8),
    };
}
