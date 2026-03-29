const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DEFAULT_LOCAL_URL = 'http://localhost:3000';
const UPDATE_DEALS_TARGET = (process.env.UPDATE_DEALS_TARGET || 'local').toLowerCase();
const CRON_SECRET = process.env.CRON_SECRET || '';

function normalizeBaseUrl(value) {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();
  const withProtocol = trimmed
    .replace(/^https:(?!\/\/)/i, 'https://')
    .replace(/^http:(?!\/\/)/i, 'http://');

  try {
    const normalized = new URL(withProtocol);
    return normalized.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function resolveApiUrl() {
  if (UPDATE_DEALS_TARGET === 'remote') {
    const configuredUrl = normalizeBaseUrl(
      process.env.UPDATE_DEALS_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    );

    if (!configuredUrl) {
      throw new Error(
        'Remote update target requires UPDATE_DEALS_URL or NEXT_PUBLIC_APP_URL to be a valid absolute URL.'
      );
    }

    return configuredUrl;
  }

  return DEFAULT_LOCAL_URL;
}

async function runUpdate() {
  const API_URL = resolveApiUrl();

  console.log('--- Starting Deal Update Trigger ---');
  console.log(`Target URL: ${API_URL}/api/serverutils/update-deals`);
  console.log(`Target Mode: ${UPDATE_DEALS_TARGET}`);
  
  try {
    const response = await axios.get(`${API_URL}/api/serverutils/update-deals`, {
      params: {
        key: CRON_SECRET
      }
    });
    
    console.log('Success!');
    console.log('Summary:', response.data.message);
    console.log('Processed:', response.data.processed);
    console.log('Homepage Deals Stored:', response.data.homepageDealsStored);
    console.log('Generated At:', response.data.generatedAtIso);
    console.log('Details:', JSON.stringify(response.data.details, null, 2));
  } catch (error) {
    if (error.code === 'ECONNREFUSED' && UPDATE_DEALS_TARGET !== 'remote') {
      console.error('Local dev server is not reachable at http://localhost:3000. Start your dev server first, then run npm run update-deals again.');
      process.exit(1);
    }

    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

runUpdate();
