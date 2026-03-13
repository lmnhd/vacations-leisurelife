import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const awsRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

const baseDynamoClient = new DynamoDBClient({
    region: awsRegion,
});

export const chatDynamoDocumentClient = DynamoDBDocumentClient.from(baseDynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});
