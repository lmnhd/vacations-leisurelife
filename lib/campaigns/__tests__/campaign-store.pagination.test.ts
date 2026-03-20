import assert from 'node:assert/strict';
import { scanAllCampaigns, scanUnmatchedCampaigns } from '../campaign-store';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';

type SendShape = {
    send: (command: unknown) => Promise<{ Items?: Array<Record<string, unknown>>; LastEvaluatedKey?: Record<string, unknown> }>;
};

let passed = 0;
let failed = 0;

function test(label: string, fn: () => Promise<void>): Promise<void> {
    return fn()
        .then(() => {
            console.log(`  ✓ ${label}`);
            passed++;
        })
        .catch((error) => {
            console.error(`  ✗ ${label}`);
            console.error(`    ${error instanceof Error ? error.message : String(error)}`);
            failed++;
        });
}

console.log('\nCampaign Store Pagination Regression\n');

async function main(): Promise<void> {
    await test('scanAllCampaigns aggregates all DynamoDB scan pages', async () => {
        const client = chatDynamoDocumentClient as unknown as SendShape;
        const originalSend = client.send;
        const observedKeys: Array<Record<string, unknown> | undefined> = [];

        let callCount = 0;
        client.send = async (command: unknown) => {
            callCount += 1;
            const input = (command as { input?: { ExclusiveStartKey?: Record<string, unknown> } }).input;
            observedKeys.push(input?.ExclusiveStartKey);

            if (callCount === 1) {
                return {
                    Items: [
                        { id: 'campaign-a', SK: 'METADATA' },
                        { id: 'campaign-b', SK: 'METADATA' },
                    ],
                    LastEvaluatedKey: { PK: 'CAMPAIGN#campaign-b', SK: 'METADATA' },
                };
            }

            return {
                Items: [
                    { id: 'campaign-c', SK: 'METADATA' },
                ],
            };
        };

        try {
            const campaigns = await scanAllCampaigns();
            assert.equal(callCount, 2);
            assert.equal(observedKeys[0], undefined);
            assert.deepEqual(observedKeys[1], { PK: 'CAMPAIGN#campaign-b', SK: 'METADATA' });
            assert.deepEqual(campaigns.map((campaign) => campaign.id), ['campaign-a', 'campaign-b', 'campaign-c']);
        } finally {
            client.send = originalSend;
        }
    });

    await test('scanUnmatchedCampaigns aggregates all DynamoDB scan pages', async () => {
        const client = chatDynamoDocumentClient as unknown as SendShape;
        const originalSend = client.send;
        const observedKeys: Array<Record<string, unknown> | undefined> = [];

        let callCount = 0;
        client.send = async (command: unknown) => {
            callCount += 1;
            const input = (command as { input?: { ExclusiveStartKey?: Record<string, unknown> } }).input;
            observedKeys.push(input?.ExclusiveStartKey);

            if (callCount === 1) {
                return {
                    Items: [
                        { id: 'campaign-a', SK: 'METADATA', pricingStatus: 'AI_ESTIMATE' },
                    ],
                    LastEvaluatedKey: { PK: 'CAMPAIGN#campaign-a', SK: 'METADATA' },
                };
            }

            return {
                Items: [
                    { id: 'campaign-b', SK: 'METADATA' },
                    { id: 'campaign-c', SK: 'METADATA', pricingStatus: 'UNMATCHED' },
                ],
            };
        };

        try {
            const campaigns = await scanUnmatchedCampaigns();
            assert.equal(callCount, 2);
            assert.equal(observedKeys[0], undefined);
            assert.deepEqual(observedKeys[1], { PK: 'CAMPAIGN#campaign-a', SK: 'METADATA' });
            assert.deepEqual(campaigns.map((campaign) => campaign.id), ['campaign-a', 'campaign-b', 'campaign-c']);
        } finally {
            client.send = originalSend;
        }
    });

    console.log(`\nPassed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});