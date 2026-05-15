import { NextRequest, NextResponse } from "next/server";
import { verifyWaitlistEmail } from "@/lib/campaigns/waitlist-store";
import { getVerifiedWaitlistSummary } from "@/lib/campaigns/waitlist-store";
import { getCampaignBlueprint, saveCampaignBlueprint } from "@/lib/campaigns/campaign-store";
import { appendLeadEvent } from "@/lib/campaigns/conversion-store";
import {
    getPublicGroupCabinTarget,
    getPublicThresholdPercent,
} from "@/lib/campaigns/threshold-policy";
import { dispatchEmailBroadcast } from "@/lib/campaigns/email/email-event-orchestrator";
import { listCampaignWaitlistEntries } from "@/lib/campaigns/waitlist-store";
import { sendThresholdSms } from "@/lib/campaigns/nurture-orchestrator";

export const dynamic = "force-dynamic";

/**
 * GET /api/groups/campaign/[slug]/verify?email=...&token=...
 *
 * Called when the guest clicks the verification link in their confirmation
 * email. Flips `emailVerified = true`, and if this verification pushes the
 * verified entry count to the 8-cabin threshold, auto-promotes the campaign.
 *
 * On success, redirects the guest back to the campaign landing page with a
 * `?verified=1` query param so the UI can show a confirmation banner.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const { searchParams } = request.nextUrl;
    const email = searchParams.get("email");
    const token = searchParams.get("token");

    if (!email || !token) {
        return NextResponse.json(
            { success: false, error: "Missing email or token." },
            { status: 400 },
        );
    }

    try {
        const result = await verifyWaitlistEmail(slug, email, token);

        if (!result.alreadyVerified) {
            await appendLeadEvent({
                campaignSlug: slug,
                email: result.entry.email,
                eventType: "email_verified",
                attribution: {
                    sourceChannel: "internal",
                    provider: "email-verification",
                    providerCampaignId: slug,
                },
                notes: `Email verified for ${result.entry.email}`,
            });

            // Check if this verification crosses the threshold.
            await checkAndPromoteThreshold(slug, result.entry.email);
        }

        // Redirect to the landing page with a verified flag.
        const landingUrl = new URL(`/groups/${slug}`, request.nextUrl.origin);
        landingUrl.searchParams.set("verified", "1");
        return NextResponse.redirect(landingUrl, 303);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Verify] Failed for ${email} in ${slug}:`, message);

        // Still redirect — don't strand the user on a JSON error page.
        const landingUrl = new URL(`/groups/${slug}`, request.nextUrl.origin);
        landingUrl.searchParams.set("verify_error", "1");
        return NextResponse.redirect(landingUrl, 303);
    }
}

/**
 * After a new email verification, re-check whether the verified entry count
 * now meets the threshold. If so, auto-promote the campaign to THRESHOLD_MET.
 */
async function checkAndPromoteThreshold(slug: string, triggeringEmail: string): Promise<void> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign || campaign.status !== "GATHERING_INTEREST") return;

    const verifiedSummary = await getVerifiedWaitlistSummary(slug);
    const requiredCabins = getPublicGroupCabinTarget(campaign);

    if (verifiedSummary.totalEntries < requiredCabins) return;

    // Promote!
    await saveCampaignBlueprint({
        ...campaign,
        status: "THRESHOLD_MET",
        updatedAt: new Date().toISOString(),
    });

    const attribution = {
        sourceChannel: "internal" as const,
        provider: "email-verification",
        providerCampaignId: slug,
    };

    await appendLeadEvent({
        campaignSlug: slug,
        email: triggeringEmail,
        eventType: "threshold_met",
        attribution,
        notes: `Auto-promoted after verified entry ${verifiedSummary.totalEntries} of ${requiredCabins} required`,
    });

    // Fire threshold SMS for leads with phone numbers — non-fatal.
    void listCampaignWaitlistEntries(slug)
        .then((allLeads) => {
            const leadsWithPhone = allLeads.filter((l) => !!l.phoneNumber);
            for (const lead of leadsWithPhone) {
                void sendThresholdSms(slug, lead.email).catch((err) => {
                    console.error(`[Verify] threshold SMS failed for ${lead.email}:`, err);
                });
            }
        })
        .catch((err) => {
            console.error("[Verify] Failed to load leads for threshold SMS:", err);
        });

    // Fire threshold_met email broadcast — non-fatal.
    void dispatchEmailBroadcast(slug, "threshold_met").catch((err) => {
        console.error(`[Verify] threshold_met email broadcast failed for ${slug}:`, err);
    });
}
