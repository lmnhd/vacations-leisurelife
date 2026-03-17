import type {
    CampaignAestheticBrief,
    ProductionBuildLintIssue,
    ProductionBuildLintReport,
} from '@/lib/campaigns/schema';

export async function readJsonResponse<T extends Record<string, unknown>>(response: Response): Promise<T> {
    const responseText = await response.text();
    if (!responseText) {
        return {} as T;
    }

    try {
        return JSON.parse(responseText) as T;
    } catch {
        throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText})`);
    }
}

export interface ApproveAestheticBriefResponse {
    success?: boolean;
    brief?: CampaignAestheticBrief;
    error?: string;
    details?: string;
}

export interface RegenerateProductionBibleResponse {
    brief?: CampaignAestheticBrief;
    error?: string;
    details?: string;
    lintVerdict?: string;
    lintReport?: ProductionBuildLintReport;
    blockingIssues?: ProductionBuildLintIssue[];
}

export async function approveAestheticBrief(slug: string): Promise<{
    response: Response;
    data: ApproveAestheticBriefResponse;
}> {
    const response = await fetch(`/api/groups/campaign/${slug}/media/aesthetic/approve`, {
        method: 'POST',
    });
    const data = await readJsonResponse<ApproveAestheticBriefResponse>(response);
    return { response, data };
}

export async function regenerateProductionBible(slug: string): Promise<{
    response: Response;
    data: RegenerateProductionBibleResponse;
}> {
    const response = await fetch(`/api/groups/campaign/${slug}/media/aesthetic/production-bible`, {
        method: 'POST',
    });
    const data = await readJsonResponse<RegenerateProductionBibleResponse>(response);
    return { response, data };
}