import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const awsRegion = process.env.AWS_REGION;

if (!awsRegion) {
    throw new Error('AWS_REGION is required for chat DynamoDB access.');
}

const baseDynamoClient = new DynamoDBClient({
    region: awsRegion,
});

export const chatDynamoDocumentClient = DynamoDBDocumentClient.from(baseDynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});
