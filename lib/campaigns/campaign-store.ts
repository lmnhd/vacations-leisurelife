import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import { Campaign } from './types';
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
