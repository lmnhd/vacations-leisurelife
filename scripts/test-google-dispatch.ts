import { createGoogleDisplayDraft } from "../lib/campaigns/distribution/platforms/google-ads/campaign";
import { getCampaignBlueprint } from "../lib/campaigns/campaign-store";
import { getMediaManifest } from "../lib/campaigns/media/media-store";
import { getDistributionSchedule } from "../lib/campaigns/distribution-store";

async function test() {
    try {
        const slug = "bp-opendeck-icon-2027-7n-caribbean";
        const campaign = await getCampaignBlueprint(slug);
        const manifest = await getMediaManifest(slug);
        const schedule = await getDistributionSchedule(slug);
        const post = schedule.posts.find(p => p.platform === "google_display");
        
        if (!post) throw new Error("No google_display post found in schedule");
        
        console.log("Found post, calling createGoogleDisplayDraft...");
        const result = await createGoogleDisplayDraft(campaign.id, post, manifest, "A themed group cruise vacation.");
        console.log("Success:", result);
    } catch (e) {
        console.error("FULL ERROR:");
        console.error(e);
        if (e.errors) console.error("Validation/API errors:", JSON.stringify(e.errors, null, 2));
    }
}
test();
