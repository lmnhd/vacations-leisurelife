import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const promptsPath = path.join(__dirname, 'seaside-prompts.json');
const outDir = path.join(__dirname, '../public/images/moods');

// Make sure output dir exists
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));

// Helper to download image
const downloadImage = (url, filepath) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                res.pipe(fs.createWriteStream(filepath))
                    .on('error', reject)
                    .once('close', () => resolve(filepath));
            } else {
                res.resume();
                reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
            }
        });
    });
};

async function run() {
    console.log(`Starting generation for ${prompts.length} mood images...`);

    // We'll process them in batches of 3 to avoid hanging the API or hitting tight rate limits
    const BATCH_SIZE = 3;

    for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
        const batch = prompts.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (item) => {
            const safeEnv = item.environment.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const safeVar = item.variant.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const filename = `${safeEnv}-${safeVar}.png`;
            const filepath = path.join(outDir, filename);

            if (fs.existsSync(filepath)) {
                console.log(`[SKIP] ${filename} already exists.`);
                return;
            }

            try {
                console.log(`[START] Generating ${filename}...`);
                const response = await openai.images.generate({
                    model: "dall-e-3",
                    prompt: item.prompt,
                    n: 1,
                    size: "1024x1024",
                    response_format: "url",
                    quality: "standard" // standard is cheaper and faster than hd, highly sufficient for blurred UI backgrounds
                });

                const url = response.data[0].url;
                await downloadImage(url, filepath);
                console.log(`[DONE] Saved ${filename}`);
            } catch (err) {
                console.error(`[ERROR] Failed on ${filename}:`, err?.error?.message || err.message);
            }
        });

        await Promise.all(promises);

        if (i + BATCH_SIZE < prompts.length) {
            console.log(`Batch complete. Waiting 5 seconds before next batch to respect rate limits...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log("All generations complete!");
}

run().catch(console.error);
