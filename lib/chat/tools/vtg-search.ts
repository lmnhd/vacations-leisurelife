import axios from 'axios';
import { load } from 'cheerio';
import path from 'path';
import { readFileSync } from 'fs';

// VTG cruise line codes for the `v` param
export const VTG_CRUISE_LINE_CODES: Record<string, number> = {
    'all': 0,
    'Carnival': 3,
    'Celebrity': 5,
    'Crystal': 7,
    'Disney': 9,
    'Holland America': 12,
    'Norwegian': 16,
    'Princess': 19,
    'Royal Caribbean': 21,
    'Seabourn': 23,
    'Cunard': 8,
    'Oceania': 17,
    'Costa': 6,
    'MSC': 15,
    'Azamara': 2,
    'Silversea': 24,
    'Regent Seven Seas': 20,
    'Viking': 26,
    'Virgin Voyages': 27,
};

// VTG region codes for the `r` param
export const VTG_REGION_CODES: Record<string, number> = {
    'all': 0,
    'Caribbean': 1,
    'Bahamas': 2,
    'Mexico': 3,
    'Bermuda': 4,
    'Alaska': 5,
    'Hawaii': 6,
    'Europe': 7,
    'Mediterranean': 8,
    'South America': 9,
    'Panama Canal': 10,
    'Asia': 11,
    'Australia': 12,
    'Africa': 13,
    'Canada/New England': 14,
    'Transatlantic': 15,
    'Transpacific': 16,
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
    return `${cookies[4].name}=${cookies[4].value}`;
}

function resolveCode(map: Record<string, number>, key: string | null): number {
    if (!key) return 0;
    const normalized = key.trim().toLowerCase();
    const entry = Object.entries(map).find(([k]) => k.toLowerCase() === normalized);
    return entry ? entry[1] : 0;
}

function buildVtgUrl(input: VtgSearchInput): string {
    const v = resolveCode(VTG_CRUISE_LINE_CODES, input.cruiseLine);
    const r = resolveCode(VTG_REGION_CODES, input.region);
    const n = input.passengers ?? 2;

    const now = new Date();
    const defaultStartYYYYMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const defaultEndYYYYMM = `${now.getFullYear()}${String(now.getMonth() + 4).padStart(2, '0')}`;

    const sm = input.startMonth ?? defaultStartYYYYMM;
    const tm = input.endMonth ?? defaultEndYYYYMM;
    const sd = sm;
    const td = tm;

    const minNights = input.minNights ?? 0;
    const maxNights = input.maxNights ?? 0;

    // l = min nights bucket: 0=any, 2=2-4, 5=5-7, 7=7-9, 10=10-13, 14=14+
    const lMap: Array<[number, number]> = [[14, 14], [10, 10], [7, 7], [5, 5], [2, 2]];
    const l = lMap.find(([threshold]) => minNights >= threshold)?.[1] ?? 0;

    return `https://www.vacationstogo.com/ticker.cfm?incCT=y&sm=${sm}&tm=${tm}&r=${r}&l=${l}&s=0&n=${n}&d=${maxNights}&v=${v}&sd=${sd}&td=${td}&rd=0&rt=0`;
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
