import assert from 'node:assert/strict';

import type { AssetRecord } from '../../../schema';
import {
    createTikTokLeadForm,
    createTikTokPaidLeadGenDraft,
} from '../tiktok-paid';

type MockResponse = {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
};

type MockFetchCall = {
    url: string;
    init?: RequestInit;
};

function jsonResponse(body: unknown, status = 200): MockResponse {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    };
}

function createMockFetch(responses: MockResponse[]) {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit): Promise<MockResponse> => {
        const next = responses.shift();
        if (!next) {
            throw new Error(`Unexpected fetch call: ${String(url)}`);
        }

        calls.push({ url: String(url), init });
        return next;
    }) as unknown as typeof fetch;

    return { calls, fetchImpl };
}

async function runTest(label: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`✓ ${label}`);
    } catch (error) {
        console.error(`✗ ${label}`);
        console.error(error);
        throw error;
    }
}

function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(vars)) {
        previous[key] = process.env[key];
        process.env[key] = value;
    }

    return fn().finally(() => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });
}

async function main(): Promise<void> {
    const mockAdvertiserStatus = {
        ready: true,
        advertiserAccountId: 'adv_123',
        appId: 'app_456',
    } as const;

    const mockAssetRecord = {
        assetId: 'asset_video_123',
        assetType: 'tiktok_seed_video',
        url: 'https://cdn.example.com/generated/tiktok-seed.mp4',
        generator: 'runwayml',
        promptUsed: 'test prompt',
        fileSizeBytes: 1024,
        mimeType: 'video/mp4',
        tags: [],
        createdAt: '2026-05-05T00:00:00.000Z',
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
    } as AssetRecord;

    await runTest('createTikTokLeadForm posts the real lead-form payload', async () => {
        const { calls, fetchImpl } = createMockFetch([
            jsonResponse({
                code: 0,
                message: 'OK',
                request_id: 'lead-form-request',
                data: { form_id: 'form_abc123' },
            }),
        ]);

        await withEnv(
            { TIKTOK_MARKETING_ACCESS_TOKEN: 'token_123' },
            async () => {
                const formId = await createTikTokLeadForm(
                    'board-games-at-sea',
                    'https://example.com/groups/board-games-at-sea',
                    {
                        fetchImpl,
                        getAdvertiserStatus: () => mockAdvertiserStatus,
                    },
                );

                assert.equal(formId, 'form_abc123');
            },
        );

        assert.equal(calls.length, 1);
        assert.equal(
            calls[0].url,
            'https://business-api.tiktok.com/open_api/v1.3/leadgen/form/create/',
        );

        const body = JSON.parse(calls[0].init?.body as string) as Record<string, unknown>;
        assert.equal(body.advertiser_id, mockAdvertiserStatus.advertiserAccountId);
        assert.match(String(body.form_name), /^LLI-board-games-at-sea-lead-form-/);
        assert.equal(body.form_type, 'INSTANT_FORM');
        assert.equal(body.locale, 'en_US');
        assert.deepEqual(body.thank_you_page, {
            type: 'WEBSITE',
            website_url: 'https://example.com/groups/board-games-at-sea',
        });

        const questions = body.questions as Array<Record<string, unknown>>;
        assert.equal(questions.length, 3);
        assert.deepEqual(
            questions.map((question) => question.title),
            ['First Name', 'Email', 'Phone Number'],
        );
    });

    await runTest('createTikTokPaidLeadGenDraft uploads the asset URL before ad creation', async () => {
        const { calls, fetchImpl } = createMockFetch([
            jsonResponse({
                code: 0,
                message: 'OK',
                request_id: 'campaign-request',
                data: { campaign_id: 'camp_001' },
            }),
            jsonResponse({
                code: 0,
                message: 'OK',
                request_id: 'adgroup-request',
                data: { adgroup_id: 'adg_002' },
            }),
            jsonResponse({
                code: 0,
                message: 'OK',
                request_id: 'upload-request',
                data: {
                    video_id: 'video_003',
                    width: 1080,
                    height: 1920,
                    duration: 15,
                    material_id: 'material_004',
                },
            }),
            jsonResponse({
                code: 0,
                message: 'OK',
                request_id: 'ad-request',
                data: { ad_id: 'ad_005' },
            }),
        ]);

        await withEnv(
            { TIKTOK_MARKETING_ACCESS_TOKEN: 'token_123' },
            async () => {
                const contract = await createTikTokPaidLeadGenDraft(
                    {
                        campaignSlug: 'board-games-at-sea',
                        advertiserAccountId: mockAdvertiserStatus.advertiserAccountId,
                        adAssetId: mockAssetRecord.assetId,
                        leadFormTemplateId: 'form_abc123',
                        dailyBudget: 20,
                    },
                    {
                        fetchImpl,
                        getAdvertiserStatus: () => mockAdvertiserStatus,
                        getAssetRecord: async () => mockAssetRecord,
                        now: () => new Date('2026-05-05T12:00:00.000Z'),
                    },
                );

                assert.equal(contract.nativeCampaignId, 'camp_001');
                assert.equal(contract.nativeAdGroupId, 'adg_002');
                assert.equal(contract.nativeAdId, 'ad_005');
                assert.equal(contract.nativeFormId, 'form_abc123');
                assert.equal(contract.activationState, 'paused');
                assert.equal(contract.createdAt, '2026-05-05T12:00:00.000Z');
                assert.equal(contract.updatedAt, '2026-05-05T12:00:00.000Z');
            },
        );

        assert.equal(calls.length, 4);
        assert.equal(calls[0].url, 'https://business-api.tiktok.com/open_api/v1.3/campaign/create/');
        assert.equal(calls[1].url, 'https://business-api.tiktok.com/open_api/v1.3/adgroup/create/');
        assert.equal(calls[2].url, 'https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/');
        assert.equal(calls[3].url, 'https://business-api.tiktok.com/open_api/v1.3/ad/create/');

        const adGroupBody = JSON.parse(calls[1].init?.body as string) as Record<string, unknown>;
        assert.equal(adGroupBody.promotion_type, 'LEAD_GENERATION');
        assert.equal(adGroupBody.promotion_target_type, 'INSTANT_PAGE');
        assert.equal(adGroupBody.optimization_goal, 'LEADS');
        assert.equal(adGroupBody.bid_type, 'BID_TYPE_CUSTOM');
        assert.equal(adGroupBody.conversion_bid_price, 16);
        assert.equal(adGroupBody.schedule_start_time, '2026-05-05T12:00:00.000Z');
        assert.deepEqual(adGroupBody.location_ids, ['6252001']);
        assert.deepEqual(adGroupBody.age_groups, ['AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_100']);

        const uploadBody = JSON.parse(calls[2].init?.body as string) as Record<string, unknown>;
        assert.equal(uploadBody.advertiser_id, mockAdvertiserStatus.advertiserAccountId);
        assert.equal(uploadBody.video_url, mockAssetRecord.url);
        assert.equal(uploadBody.display_name, 'LLI-board-games-at-sea-creative');

        const adBody = JSON.parse(calls[3].init?.body as string) as Record<string, unknown>;
        assert.equal(adBody.video_id, 'video_003');
        assert.equal(adBody.lead_form_id, 'form_abc123');
    });

    await runTest('createTikTokPaidLeadGenDraft rejects non-video assets before upload', async () => {
        const { fetchImpl } = createMockFetch([]);
        const badAsset = {
            ...mockAssetRecord,
            assetId: 'asset_image_001',
            assetType: 'hero_image',
            mimeType: 'image/jpeg',
            url: 'https://cdn.example.com/generated/hero.jpg',
        } as AssetRecord;

        await withEnv(
            { TIKTOK_MARKETING_ACCESS_TOKEN: 'token_123' },
            async () => {
                await assert.rejects(
                    () => createTikTokPaidLeadGenDraft(
                        {
                            campaignSlug: 'board-games-at-sea',
                            advertiserAccountId: mockAdvertiserStatus.advertiserAccountId,
                            adAssetId: badAsset.assetId,
                            leadFormTemplateId: 'form_abc123',
                        },
                        {
                            fetchImpl,
                            getAdvertiserStatus: () => mockAdvertiserStatus,
                            getAssetRecord: async () => badAsset,
                        },
                    ),
                    /Asset must be a video asset before TikTok upload/,
                );
            },
        );
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
