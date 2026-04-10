import type { LeadAttribution } from './types';

/**
 * Raw attribution fields as submitted from the landing page or a provider webhook.
 * All fields are optional — normalize whatever arrives.
 */
export interface RawAttributionInput {
    sourceChannel?: string;
    provider?: string;
    providerDraftType?: string;
    providerCampaignId?: string;
    providerAdGroupId?: string;
    providerAdId?: string;
    providerLeadId?: string;
    landingPath?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    sessionId?: string;
}

/**
 * Normalize a raw attribution input into a clean LeadAttribution record.
 * Trims strings, drops empty values, and derives sourceChannel truthfully:
 *
 * - Explicit sourceChannel (e.g. from provider webhook): preserved as-is
 * - UTM present: use utmMedium if set, else `utm:${utmSource}`
 * - Referrer present but no UTM: `referral`
 * - No UTM and no referrer: `direct`
 */
export function normalizeAttribution(raw: RawAttributionInput): LeadAttribution {
    function trimOrUndefined(value: string | undefined): string | undefined {
        const trimmed = value?.trim();
        return trimmed || undefined;
    }

    const utmMedium = trimOrUndefined(raw.utmMedium);
    const utmSource = trimOrUndefined(raw.utmSource);
    const referrer = trimOrUndefined(raw.referrer);

    // Derive sourceChannel truthfully — do not collapse everything into organic.
    let sourceChannel = trimOrUndefined(raw.sourceChannel);
    if (!sourceChannel) {
        if (utmMedium) {
            sourceChannel = utmMedium;
        } else if (utmSource) {
            sourceChannel = `utm:${utmSource}`;
        } else if (referrer) {
            sourceChannel = 'referral';
        } else {
            sourceChannel = 'direct';
        }
    }

    const attribution: LeadAttribution = {};

    if (sourceChannel) attribution.sourceChannel = sourceChannel;
    if (raw.provider) attribution.provider = trimOrUndefined(raw.provider);
    if (raw.providerDraftType) attribution.providerDraftType = trimOrUndefined(raw.providerDraftType);
    if (raw.providerCampaignId) attribution.providerCampaignId = trimOrUndefined(raw.providerCampaignId);
    if (raw.providerAdGroupId) attribution.providerAdGroupId = trimOrUndefined(raw.providerAdGroupId);
    if (raw.providerAdId) attribution.providerAdId = trimOrUndefined(raw.providerAdId);
    if (raw.providerLeadId) attribution.providerLeadId = trimOrUndefined(raw.providerLeadId);
    if (raw.landingPath) attribution.landingPath = trimOrUndefined(raw.landingPath);
    if (referrer) attribution.referrer = referrer;
    if (utmSource) attribution.utmSource = utmSource;
    if (utmMedium) attribution.utmMedium = utmMedium;
    if (raw.utmCampaign) attribution.utmCampaign = trimOrUndefined(raw.utmCampaign);
    if (raw.utmContent) attribution.utmContent = trimOrUndefined(raw.utmContent);
    if (raw.utmTerm) attribution.utmTerm = trimOrUndefined(raw.utmTerm);
    if (raw.sessionId) attribution.sessionId = trimOrUndefined(raw.sessionId);

    return attribution;
}

/**
 * Build a TikTok provider attribution object from webhook lead event fields.
 */
export function buildTikTokAttribution(opts: {
    adId?: string;
    formId?: string;
    campaignId?: string;
    leadId?: string;
}): LeadAttribution {
    return normalizeAttribution({
        sourceChannel: 'tiktok_paid',
        provider: 'tiktok',
        providerCampaignId: opts.campaignId,
        providerAdId: opts.adId,
        providerLeadId: opts.leadId,
        providerDraftType: opts.formId ? `form:${opts.formId}` : undefined,
    });
}
