import { PutCommand, GetCommand, UpdateCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import type { Campaign, CampaignInventoryCandidate, CampaignInventoryMode, InventoryHealthStatus } from './types';
import { CbInventoryMatch } from './cb-inventory-matcher';
import type { BookingLinkValidationResult } from './booking-link-validator';
import {
    CampaignAestheticBrief,
    CampaignAestheticBriefSchema,
    CampaignResearchDossier,
    normalizeCampaignIdentityBlueprint,
    normalizeCommunityExpression,
    normalizeHumanRepresentationGuidance,
    normalizeVisualPlausibilityFramework,
} from './schema';
import { buildCampaignIdentityBlueprintAsync } from './design-system/identity-blueprint';

const TABLE_NAME = 'lll-shadow-campaigns';

function normalizeStoredAestheticBriefShape(brief: CampaignAestheticBrief): CampaignAestheticBrief {
    return {
        ...brief,
        visual: {
            ...brief.visual,
            plausibilityFramework: normalizeVisualPlausibilityFramework(brief.visual?.plausibilityFramework),
            humanRepresentation: normalizeHumanRepresentationGuidance(brief.visual?.humanRepresentation),
        },
        communityExpression: normalizeCommunityExpression(brief.communityExpression),
        identityBlueprint: brief.identityBlueprint
            ? normalizeCampaignIdentityBlueprint(brief.identityBlueprint)
            : undefined,
    };
}

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

export async function deleteCampaignBlueprint(slug: string): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
    };
    try {
        await chatDynamoDocumentClient.send(new DeleteCommand(params));
    } catch (error) {
        console.error(`Failed to delete campaign ${slug}:`, error);
        throw error;
    }
}

export async function deleteAllCampaigns(): Promise<number> {
    const campaigns = await scanAllCampaigns();
    await Promise.all(campaigns.map(c => deleteCampaignBlueprint(c.id)));
    return campaigns.length;
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
    const campaign = await getCampaignBlueprint(brief.slug);
    const enrichedBrief = campaign
        ? { ...brief, identityBlueprint: await buildCampaignIdentityBlueprintAsync(brief, campaign) }
        : brief;
    const normalizedBrief = CampaignAestheticBriefSchema.parse(normalizeStoredAestheticBriefShape(enrichedBrief));
    const params = {
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${normalizedBrief.slug}`,
            SK: 'MEDIA#AESTHETIC_BRIEF',
            ...normalizedBrief,
        },
    };

    try {
        await chatDynamoDocumentClient.send(new PutCommand(params));

        // Also update the campaign metadata to reflect the change
        const updateParams = {
            TableName: TABLE_NAME,
            Key: {
                PK: `CAMPAIGN#${normalizedBrief.slug}`,
                SK: 'METADATA',
            },
            UpdateExpression: 'SET aestheticBriefStatus = :status, aestheticGeneratedAt = :now',
            ExpressionAttributeValues: {
                ':status': normalizedBrief.humanReviewStatus,
                ':now': new Date().toISOString()
            }
        };
        await chatDynamoDocumentClient.send(new UpdateCommand(updateParams));

    } catch (error) {
        console.error(`Failed to save aesthetic brief for ${normalizedBrief.slug}:`, error);
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
        const parsedBrief = CampaignAestheticBriefSchema.parse(normalizeStoredAestheticBriefShape(briefData as CampaignAestheticBrief));
        if (parsedBrief.identityBlueprint) {
            return parsedBrief;
        }

        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            return parsedBrief;
        }

        return CampaignAestheticBriefSchema.parse(normalizeStoredAestheticBriefShape({
            ...parsedBrief,
            identityBlueprint: await buildCampaignIdentityBlueprintAsync(parsedBrief, campaign),
        }));
    } catch (error) {
        console.error(`Failed to get aesthetic brief for ${slug}:`, error);
        throw error;
    }
}

export async function deleteAestheticBrief(slug: string): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            PK: `CAMPAIGN#${slug}`,
            SK: 'MEDIA#AESTHETIC_BRIEF',
        },
    };

    try {
        await chatDynamoDocumentClient.send(new DeleteCommand(params));

        // Clear the status flags on the campaign METADATA record
        const updateParams = {
            TableName: TABLE_NAME,
            Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
            UpdateExpression: 'REMOVE aestheticBriefStatus, aestheticGeneratedAt',
        };
        await chatDynamoDocumentClient.send(new UpdateCommand(updateParams));
    } catch (error) {
        console.error(`Failed to delete aesthetic brief for ${slug}:`, error);
        throw error;
    }
}

interface InventoryHealthPayload {
    inventoryCandidates?: CampaignInventoryCandidate[];
    activeBookingMode?: CampaignInventoryMode;
    inventoryHealth?: InventoryHealthStatus;
    inventoryLastCheckedAt?: string;
}

/**
 * Writes CB inventory match results onto the campaign METADATA record.
 * Called by run-phase-b.ts after a successful inventory match.
 * Pass healthPayload to also persist ranked candidates and health state.
 */
export async function upsertCampaignPricingMatch(
    slug: string,
    match: CbInventoryMatch,
    healthPayload?: InventoryHealthPayload,
): Promise<void> {
    const retailLinkExpr = match.odysseusRetailBookingLink ? ', odysseusRetailBookingLink = :retailLink' : '';
    const healthExpr = healthPayload
        ? ', inventoryCandidates = :candidates, activeBookingMode = :bookingMode, inventoryHealth = :invHealth, inventoryLastCheckedAt = :checkedAt'
        : '';

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
            'matchedShipName = :matchedShipName',
            'matchedSailDate = :matchedSailDate',
            'matchedDeparturePort = :matchedDeparturePort',
            'matchedNights = :matchedNights',
            'updatedAt = :now',
        ].join(', ') + retailLinkExpr + healthExpr,
        ExpressionAttributeValues: {
            ':groupId': match.cbGroupId,
            ':link': match.cbPersonalLink,
            ':advantage': match.cbPriceAdvantage,
            ':price': match.computedStartingPrice,
            ':source': match.priceSource,
            ':pricingStatus': 'CB_MATCHED' as const,
            ':matchedShipName': match.matchedShipName,
            ':matchedSailDate': match.matchedSailDate,
            ':matchedDeparturePort': match.matchedDeparturePort ?? '',
            ':matchedNights': match.matchedNights ?? '',
            ':now': new Date().toISOString(),
            ...(match.odysseusRetailBookingLink ? { ':retailLink': match.odysseusRetailBookingLink } : {}),
            ...(healthPayload ? {
                ':candidates': healthPayload.inventoryCandidates ?? [],
                ':bookingMode': healthPayload.activeBookingMode ?? 'GROUP_BLOCK_ACTIVE',
                ':invHealth': healthPayload.inventoryHealth ?? 'HEALTHY',
                ':checkedAt': healthPayload.inventoryLastCheckedAt ?? new Date().toISOString(),
            } : {}),
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
 * Persists the secondary campaign research dossier on the campaign METADATA
 * record. Surgical update — does not rewrite unrelated fields. Used by Phase 1.5
 * after the discovery blueprint is approved and a campaign has been selected.
 */
export async function upsertCampaignResearchDossier(
    slug: string,
    dossier: CampaignResearchDossier,
): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
        UpdateExpression: 'SET researchDossier = :dossier, researchDossierGeneratedAt = :now, updatedAt = :now',
        ExpressionAttributeValues: {
            ':dossier': dossier,
            ':now': new Date().toISOString(),
        },
    };

    try {
        await chatDynamoDocumentClient.send(new UpdateCommand(params));
    } catch (error) {
        console.error(`[campaign-store] Failed to upsert research dossier for ${slug}:`, error);
        throw error;
    }
}

/**
 * Updates only the inventory mode and health rollup — for failover transitions
 * that don't require a full Phase B re-run.
 */
export async function updateCampaignInventoryMode(
    slug: string,
    mode: CampaignInventoryMode,
    health: InventoryHealthStatus,
): Promise<void> {
    const params = {
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
        UpdateExpression: 'SET activeBookingMode = :mode, inventoryHealth = :health, inventoryLastCheckedAt = :checkedAt, updatedAt = :now',
        ExpressionAttributeValues: {
            ':mode': mode,
            ':health': health,
            ':checkedAt': new Date().toISOString(),
            ':now': new Date().toISOString(),
        },
    };

    try {
        await chatDynamoDocumentClient.send(new UpdateCommand(params));
        console.log(`[campaign-store] Inventory mode → ${mode} (${health}) for "${slug}"`);
    } catch (error) {
        console.error(`[campaign-store] Failed to update inventory mode for ${slug}:`, error);
        throw error;
    }
}

/**
 * Patches the health status of a single candidate in inventoryCandidates[rank].
 * Used by heartbeat checks to update individual link health without a full write.
 *
 * Note: DynamoDB does not support list index updates with a conditional expression
 * cleanly — this loads the full list, patches in memory, and re-writes it.
 * Suitable for low-frequency heartbeat use; not for high-concurrency paths.
 */
export async function setCampaignInventoryCandidateHealth(
    slug: string,
    rank: number,
    result: BookingLinkValidationResult,
): Promise<void> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    const candidates = (campaign.inventoryCandidates ?? []).map((c) =>
        c.rank === rank
            ? { ...c, healthStatus: result.status, lastCheckedAt: result.checkedAt, failureReason: result.failureReason }
            : c,
    );

    const primaryCandidate = candidates.find((c) => c.rank === 0);
    const inventoryHealth: InventoryHealthStatus = primaryCandidate?.healthStatus ?? 'UNVERIFIED';

    const params = {
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
        UpdateExpression: 'SET inventoryCandidates = :candidates, inventoryHealth = :health, inventoryLastCheckedAt = :checkedAt, updatedAt = :now',
        ExpressionAttributeValues: {
            ':candidates': candidates,
            ':health': inventoryHealth,
            ':checkedAt': result.checkedAt,
            ':now': new Date().toISOString(),
        },
    };

    try {
        await chatDynamoDocumentClient.send(new UpdateCommand(params));
    } catch (error) {
        console.error(`[campaign-store] Failed to patch candidate health for ${slug} rank ${rank}:`, error);
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
        UpdateExpression: [
            'SET pricingStatus = :pricingStatus, updatedAt = :now',
            'REMOVE cbagenttoolsGroupId, cbagenttoolsBookingLink, cbPriceAdvantage, priceSource, matchedShipName, matchedSailDate, matchedDeparturePort, matchedNights',
        ].join(' '),
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
        FilterExpression: 'SK = :sk AND (#ps <> :matched OR attribute_not_exists(#ps))',
        ExpressionAttributeNames: { '#ps': 'pricingStatus' },
        ExpressionAttributeValues: {
            ':sk': 'METADATA',
            ':matched': 'CB_MATCHED',
        },
    };

    try {
        const campaigns: Campaign[] = [];
        let lastEvaluatedKey: Record<string, unknown> | undefined;

        do {
            const response = await chatDynamoDocumentClient.send(new ScanCommand({
                ...params,
                ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
            }));

            campaigns.push(...((response.Items as Campaign[]) ?? []));
            lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
        } while (lastEvaluatedKey);

        return campaigns;
    } catch (error) {
        console.error('[campaign-store] Failed to scan unmatched campaigns:', error);
        throw error;
    }
}

/**
 * Scans campaign METADATA records where pricingStatus is 'CB_MATCHED'.
 * Used by run-phase-b.ts to find campaigns needing live confirmation + Odysseus retail link generation.
 */
export async function scanMatchedCampaigns(): Promise<Campaign[]> {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk AND #ps = :matched',
        ExpressionAttributeNames: { '#ps': 'pricingStatus' },
        ExpressionAttributeValues: {
            ':sk': 'METADATA',
            ':matched': 'CB_MATCHED',
        },
    };

    try {
        const campaigns: Campaign[] = [];
        let lastEvaluatedKey: Record<string, unknown> | undefined;

        do {
            const response = await chatDynamoDocumentClient.send(new ScanCommand({
                ...params,
                ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
            }));

            campaigns.push(...((response.Items as Campaign[]) ?? []));
            lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
        } while (lastEvaluatedKey);

        return campaigns;
    } catch (error) {
        console.error('[campaign-store] Failed to scan matched campaigns:', error);
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
        const campaigns: Campaign[] = [];
        let lastEvaluatedKey: Record<string, unknown> | undefined;

        do {
            const response = await chatDynamoDocumentClient.send(new ScanCommand({
                ...params,
                ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
            }));

            campaigns.push(...((response.Items as Campaign[]) ?? []));
            lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
        } while (lastEvaluatedKey);

        return campaigns;
    } catch (error) {
        console.error('[campaign-store] Failed to scan all campaigns:', error);
        throw error;
    }
}
