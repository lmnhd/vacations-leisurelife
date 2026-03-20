export const MINIMUM_CAMPAIGN_LEAD_DAYS = 180;
export const TIGHT_CAMPAIGN_LEAD_DAYS = 210;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const MONTH_NAMES = new Map<string, number>([
    ['jan', 0], ['january', 0],
    ['feb', 1], ['february', 1],
    ['mar', 2], ['march', 2],
    ['apr', 3], ['april', 3],
    ['may', 4],
    ['jun', 5], ['june', 5],
    ['jul', 6], ['july', 6],
    ['aug', 7], ['august', 7],
    ['sep', 8], ['sept', 8], ['september', 8],
    ['oct', 9], ['october', 9],
    ['nov', 10], ['november', 10],
    ['dec', 11], ['december', 11],
]);

export interface LaunchWindowAssessment {
    sailingDateText: string | null;
    sailingDateIso: string | null;
    daysUntilSail: number | null;
    meetsMinimumLeadTime: boolean | null;
    isTightLeadTime: boolean | null;
    minimumLeadDays: number;
}

export interface LaunchWindowPolicy {
    todayIso: string;
    earliestPermittedSailDateIso: string;
    minimumLeadDays: number;
    tightLeadDays: number;
}

export interface LaunchWindowComplianceCandidate {
    id: string;
    name?: string | null;
    targetDates?: string | null;
}

export interface LaunchWindowViolation {
    candidate: LaunchWindowComplianceCandidate;
    message: string;
}

function normalizeDateText(value: string): string {
    return value
        .replace(/\u2011|\u2012|\u2013|\u2014/g, '-')
        .replace(/\b([A-Za-z]{3,})\./g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function getUtcMidnight(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function addUtcDays(date: Date, days: number): Date {
    return new Date(getUtcMidnight(date) + (days * MS_PER_DAY));
}

function formatIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function parseCampaignDate(value?: string | null): Date | null {
    if (!value) {
        return null;
    }

    const normalized = normalizeDateText(value);
    const exactDate = new Date(normalized);
    if (!Number.isNaN(exactDate.getTime())) {
        return exactDate;
    }

    const monthYearMatch = normalized.match(/^([A-Za-z]+)\s+(20\d{2})$/);
    if (monthYearMatch) {
        const monthIndex = MONTH_NAMES.get(monthYearMatch[1].toLowerCase());
        const year = Number(monthYearMatch[2]);

        if (monthIndex !== undefined) {
            return new Date(Date.UTC(year, monthIndex, 1));
        }
    }

    return null;
}

export function getLaunchWindowPolicy(now: Date = new Date()): LaunchWindowPolicy {
    return {
        todayIso: formatIsoDate(now),
        earliestPermittedSailDateIso: formatIsoDate(addUtcDays(now, MINIMUM_CAMPAIGN_LEAD_DAYS)),
        minimumLeadDays: MINIMUM_CAMPAIGN_LEAD_DAYS,
        tightLeadDays: TIGHT_CAMPAIGN_LEAD_DAYS,
    };
}

export function buildLaunchWindowPromptGuidance(now: Date = new Date()): string {
    const policy = getLaunchWindowPolicy(now);

    return `

LAUNCH WINDOW RULE:
- Today is ${policy.todayIso}.
- Minimum lead time is ${policy.minimumLeadDays} days.
- Do not choose, suggest, or preserve sailings earlier than ${policy.earliestPermittedSailDateIso}.
- targetDates must be parseable as an exact sail date or a plain month-year string. Do not use vague phrases like "late summer 2026" or "holiday 2026".
- If inventory shows a ship only on ineligible dates, reject that ship for this run instead of forcing it into the plan.
- Prefer sailings outside the ${policy.tightLeadDays}-day warning band when viable alternatives exist.`.trimEnd();
}

export function assertLaunchWindowCompliance(
    candidates: LaunchWindowComplianceCandidate[],
    now: Date = new Date(),
): void {
    const violations = getLaunchWindowViolations(candidates, now).map((violation) => violation.message);

    if (violations.length > 0) {
        throw new Error(`Discovery blueprints violated the launch-window rule: ${violations.join('; ')}`);
    }
}

export function getLaunchWindowViolations(
    candidates: LaunchWindowComplianceCandidate[],
    now: Date = new Date(),
): LaunchWindowViolation[] {
    return candidates.flatMap((candidate) => {
        const targetDates = candidate.targetDates?.trim() ?? '';
        const assessment = getLaunchWindowAssessment({ targetDates }, now);

        if (!targetDates || assessment.sailingDateIso === null) {
            return [{
                candidate,
                message: `${candidate.id}: targetDates must be a parseable sail date or month-year, received "${candidate.targetDates ?? ''}"`,
            }];
        }

        if (assessment.meetsMinimumLeadTime === false) {
            const label = candidate.name?.trim() || candidate.id;
            return [{
                candidate,
                message: `${label}: ${assessment.daysUntilSail} days until sail from targetDates "${targetDates}"; minimum is ${assessment.minimumLeadDays}`,
            }];
        }

        return [];
    });
}

export function getLaunchWindowAssessment(
    input: { matchedSailDate?: string | null; targetDates?: string | null },
    now: Date = new Date(),
): LaunchWindowAssessment {
    const sourceDateText = input.matchedSailDate?.trim() || input.targetDates?.trim() || null;
    const sailingDate = parseCampaignDate(sourceDateText);

    if (!sourceDateText || !sailingDate) {
        return {
            sailingDateText: sourceDateText,
            sailingDateIso: null,
            daysUntilSail: null,
            meetsMinimumLeadTime: null,
            isTightLeadTime: null,
            minimumLeadDays: MINIMUM_CAMPAIGN_LEAD_DAYS,
        };
    }

    const nowUtc = getUtcMidnight(now);
    const sailUtc = getUtcMidnight(sailingDate);
    const daysUntilSail = Math.floor((sailUtc - nowUtc) / MS_PER_DAY);

    return {
        sailingDateText: sourceDateText,
        sailingDateIso: sailingDate.toISOString(),
        daysUntilSail,
        meetsMinimumLeadTime: daysUntilSail >= MINIMUM_CAMPAIGN_LEAD_DAYS,
        isTightLeadTime: daysUntilSail >= MINIMUM_CAMPAIGN_LEAD_DAYS && daysUntilSail < TIGHT_CAMPAIGN_LEAD_DAYS,
        minimumLeadDays: MINIMUM_CAMPAIGN_LEAD_DAYS,
    };
}
