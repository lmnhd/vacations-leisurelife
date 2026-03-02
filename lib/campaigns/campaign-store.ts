import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import { Campaign } from './types';

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
