const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || '';

async function runUpdate() {
  console.log('--- Starting Deal Update Trigger ---');
  console.log(`Target URL: ${API_URL}/api/serverutils/update-deals`);
  
  try {
    const response = await axios.get(`${API_URL}/api/serverutils/update-deals`, {
      params: {
        key: CRON_SECRET
      }
    });
    
    console.log('Success!');
    console.log('Summary:', response.data.message);
    console.log('Processed:', response.data.processed);
    console.log('Details:', JSON.stringify(response.data.details, null, 2));
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

runUpdate();
