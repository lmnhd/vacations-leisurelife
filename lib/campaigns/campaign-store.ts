import { PutCommand, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import { Campaign } from './types';
import { CbInventoryMatch } from './cb-inventory-matcher';
import { CampaignAestheticBrief } from './schema';

const TABLE_NAME = 'lll-shadow-campaigns';

export async function saveCampaignBlueprint(campaign: Campaign): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Item: campaign,
    };

    try {
        await chatDynamoDocumentClient.send(new PutCommand(params));
    } catch (error) {
        console.error(`Failed to save campaign blueprint ${campaign.id}:`, error);
        throw error;
    }
}

export async function getCampaignBlueprint(slug: string): Promise<Campaign | null> {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            PK: `CAMPAIGN#${slug}`,
            SK: 'METADATA',
        },
    };

    try {
        const response = await chatDynamoDocumentClient.send(new GetCommand(params));
        return (response.Item as Campaign) || null;
    } catch (error) {
        console.error(`Failed to get campaign blueprint ${slug}:`, error);
        throw error;
    }
}

export async function saveAestheticBrief(brief: CampaignAestheticBrief): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${brief.slug}`,
            SK: 'MEDIA#AESTHETIC_BRIEF',
            ...brief,
        },
    };

    try {
        await chatDynamoDocumentClient.send(new PutCommand(params));

        // Also update the campaign metadata to reflect the change
        const updateParams = {
            TableName: TABLE_NAME,
            Key: {
                PK: `CAMPAIGN#${brief.slug}`,
                SK: 'METADATA',
            },
            UpdateExpression: 'SET aestheticBriefStatus = :status, aestheticGeneratedAt = :now',
            ExpressionAttributeValues: {
                ':status': brief.humanReviewStatus,
                ':now': new Date().toISOString()
            }
        };
        await chatDynamoDocumentClient.send(new UpdateCommand(updateParams));

    } catch (error) {
        console.error(`Failed to save aesthetic brief for ${brief.slug}:`, error);
        throw error;
    }
}

export async function getAestheticBrief(slug: string): Promise<CampaignAestheticBrief | null> {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            PK: `CAMPAIGN#${slug}`,
            SK: 'MEDIA#AESTHETIC_BRIEF',
        },
    };

    try {
        const response = await chatDynamoDocumentClient.send(new GetCommand(params));
        if (!response.Item) return null;

        const { PK, SK, ...briefData } = response.Item;
        return briefData as CampaignAestheticBrief;
    } catch (error) {
        console.error(`Failed to get aesthetic brief for ${slug}:`, error);
        throw error;
    }
}

/**
 * Writes CB inventory match results onto the campaign METADATA record.
 * Called by run-phase-b.ts after a successful inventory match.
 */
export async function upsertCampaignPricingMatch(
    slug: string,
    match: CbInventoryMatch
): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
        UpdateExpression: [
            'SET cbagenttoolsGroupId = :groupId',
            'cbagenttoolsBookingLink = :link',
            'cbPriceAdvantage = :advantage',
            'startingPrice = :price',
            'priceSource = :source',
            'pricingStatus = :pricingStatus',
            'updatedAt = :now',
        ].join(', '),
        ExpressionAttributeValues: {
            ':groupId': match.cbGroupId,
            ':link': match.cbPersonalLink,
            ':advantage': match.cbPriceAdvantage,
            ':price': match.computedStartingPrice,
            ':source': match.priceSource,
            ':pricingStatus': 'CB_MATCHED' as const,
            ':now': new Date().toISOString(),
        },
    };

    try {
        await chatDynamoDocumentClient.send(new UpdateCommand(params));
        console.log(`[campaign-store] ✅ CB match written for campaign "${slug}"`);
    } catch (error) {
        console.error(`[campaign-store] Failed to write CB match for ${slug}:`, error);
        throw error;
    }
}

/**
 * Marks a campaign as UNMATCHED — Phase B found no suitable CB group.
 */
export async function markCampaignUnmatched(slug: string): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
        UpdateExpression: 'SET pricingStatus = :pricingStatus, updatedAt = :now',
        ExpressionAttributeValues: {
            ':pricingStatus': 'UNMATCHED' as const,
            ':now': new Date().toISOString(),
        },
    };

    try {
        await chatDynamoDocumentClient.send(new UpdateCommand(params));
    } catch (error) {
        console.error(`[campaign-store] Failed to mark ${slug} as UNMATCHED:`, error);
        throw error;
    }
}

/**
 * Scans all METADATA records where pricingStatus is 'AI_ESTIMATE' or not yet set.
 * Used by run-phase-b.ts to find campaigns needing CB inventory matching.
 */
export async function scanUnmatchedCampaigns(): Promise<Campaign[]> {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk AND (#ps = :aiEstimate OR attribute_not_exists(#ps))',
        ExpressionAttributeNames: { '#ps': 'pricingStatus' },
        ExpressionAttributeValues: {
            ':sk': 'METADATA',
            ':aiEstimate': 'AI_ESTIMATE',
        },
    };

    try {
        const response = await chatDynamoDocumentClient.send(new ScanCommand(params));
        return (response.Items as Campaign[]) ?? [];
    } catch (error) {
        console.error('[campaign-store] Failed to scan unmatched campaigns:', error);
        throw error;
    }
}

/**
 * Scans ALL campaign METADATA records regardless of pricingStatus or campaign status.
 * Used by the discovery pipeline to build an exclusion list for Perplexity prompts.
 */
export async function scanAllCampaigns(): Promise<Campaign[]> {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'METADATA' },
    };

    try {
        const response = await chatDynamoDocumentClient.send(new ScanCommand(params));
        return (response.Items as Campaign[]) ?? [];
    } catch (error) {
        console.error('[campaign-store] Failed to scan all campaigns:', error);
        throw error;
    }
}
