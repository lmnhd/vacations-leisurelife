const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');

async function main() {
    try {
        const client = new DynamoDBClient({ region: 'us-east-1' });
        const command = new ScanCommand({
            TableName: 'llv_agent_jobs'
        });
        const response = await client.send(command);
        const results = response.Items.map(item => ({
            id: item.job_id?.S,
            status: item.status?.S,
            campaign_id: item.campaign_id?.S,
            updated_at: item.updated_at?.S
        })).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));

        fs.writeFileSync('tmp/status-direct.json', JSON.stringify(results, null, 2));
        console.log('Wrote successfully to tmp/status-direct.json');
    } catch (e) {
        fs.writeFileSync('tmp/status-error.json', JSON.stringify(e.message));
    }
}
main();