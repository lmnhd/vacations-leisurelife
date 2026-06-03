// lib/campaigns/media/generators/flyer-prompt.ts
//
// PURE flyer-image prompt model — no server-only imports. Shared by:
//   • the sandbox client page (/tests/flyer-lab) for live prompt preview
//   • the lab API route (app/api/ads/flyer-lab/generate)
//   • the media orchestrator / flyer-generator (server)
//
// A flyer image is a vivid single-frame "poster" seeded by the campaign slug,
// kept on-theme with a few light brief anchors, constrained by tunable negation
// rules (developed in the sandbox), and pushed toward distinct interpretations
// by a per-rendition variation axis. The generator imposes NO defaults — callers
// choose which negations/axes/anchors to apply. The DEFAULT_* exports below are
// the seed sets the sandbox starts from.

import { normalizeCampaignResearchDossier, type CampaignResearchDossierLike } from '@/lib/campaigns/schema';

export interface FlyerPromptParts {
    /** Optional base prompt template. Use {slug} where the campaign slug should appear. */
    basePromptTemplate?: string;
    /** Enabled brief-anchor texts, e.g. "Theme: Glass Observatory." */
    anchors?: string[];
    /** Optional ultra-specific niche detail from the brief or operator override. */
    nicheHint?: string;
    /** Optional short callout texts the image model may use as in-image text boxes. */
    talkingPoints?: string[];
    /** One variation-axis directive for this rendition. */
    axis?: string;
    /** Negation rule texts (joined into a single "Avoid:" clause). */
    negations?: string[];
    /** Free-text steering note for on-the-fly regeneration. */
    steer?: string;
}

export const DEFAULT_FLYER_BASE_TEMPLATE =
    "Generate an image only, no text, for an ad promoting the following Themed Cruise:\n\n'{slug}'";

function buildFlyerBase(slug: string, template?: string): string {
    const cleanTemplate = template?.trim() || DEFAULT_FLYER_BASE_TEMPLATE;
    return cleanTemplate.includes('{slug}')
        ? cleanTemplate.replaceAll('{slug}', slug)
        : cleanTemplate;
}

/** Compose the full flyer prompt from its parts. Order is deliberate:
 *  base → anchors → rendition direction → steering note → negations. */
export function buildFlyerPrompt(slug: string, parts: FlyerPromptParts = {}): string {
    const out: string[] = [buildFlyerBase(slug, parts.basePromptTemplate)];

    const anchors = (parts.anchors ?? []).map((a) => a.trim()).filter(Boolean);
    if (anchors.length) out.push(anchors.join(' '));

    if (parts.nicheHint && parts.nicheHint.trim()) {
        out.push(`Niche detail: ${parts.nicheHint.trim()}`);
    }

    const talkingPoints = (parts.talkingPoints ?? []).map((p) => p.trim()).filter(Boolean);
    if (talkingPoints.length) {
        out.push(`Optional in-image callout text / talking points. Use as many or as few as fit the design: ${talkingPoints.join(' | ')}`);
    }

    if (parts.axis && parts.axis.trim()) out.push(`Rendition direction: ${parts.axis.trim()}`);

    if (parts.steer && parts.steer.trim()) out.push(parts.steer.trim());

    const negations = (parts.negations ?? []).map((n) => n.trim()).filter(Boolean);
    if (negations.length) out.push(`Avoid: ${negations.join('; ')}.`);

    return out.join('\n\n');
}

// ── Seed sets (the sandbox starts here; weed/extend, then export back) ─────────

// Negation rule #1 is the one that motivated this work: the model kept rendering
// a giant exterior megaship instead of the guest-aboard perspective we sell.
// Finalized in /tests/flyer-lab sandbox (2026-05-30).
// Rule added: "old fashioned or 'painted' style imagery" (model tended toward
// painterly/illustration treatments). Rule removed: the "oversized/grandiose"
// phrasing was redundant with the full-ship exterior rule.
export const DEFAULT_FLYER_NEGATIONS: string[] = [
    "full-ship exterior hero shots or the entire vessel centered as the subject",
    "drone, aerial, or wide establishing mega-ship framing",
    "unrealistic fantasy scale or sci-fi vessel forms",
    "any text, logos, captions, watermarks, or UI",
    "old fashioned or 'painted' style imagery",
];

export const DEFAULT_FLYER_VARIATION_AXES: string[] = [
    'Interior guest point-of-view from inside the vessel looking out at the destination.',
    'Intimate close moment between two guests, shallow depth of field, foreground detail.',
    'Destination landscape or wildlife leads the frame; only an edge or hint of the ship is visible.',
    'Artistic collage of all related themes in the campaign.',
    'Golden-hour or blue-hour tonal treatment, low warm light.',
    'Cozy, low-light interior ambience with practical lighting.',
    'Deck-level, human-scale vantage among the guests rather than an exterior of the ship.',
];

// ── Light brief anchors ───────────────────────────────────────────────────────

export interface FlyerAnchor { id: string; label: string; text: string; }

/** Loose brief shape so this stays decoupled from the full CampaignAestheticBrief. */
export interface FlyerBriefLike {
    themeName?: string;
    visual?: { aestheticLabel?: string };
    nicheSignals?: string[];
    communityExpression?: {
        corePromise?: string;
        socialGravity?: string;
        optionalGatherings?: string[];
        belongingSignals?: string[];
    };
    researchRationale?: string;
    audienceSignals?: string[];
    // Accepts the real brief union (canonical | legacy | record); normalized internally.
    campaignResearchDossier?: CampaignResearchDossierLike;
}

/** Pull the niche title out of either dossier shape (canonical or legacy). */
function dossierNicheTitle(dossier: CampaignResearchDossierLike): string | undefined {
    return normalizeCampaignResearchDossier(dossier)?.nicheResearch.nicheTitle;
}

/** A few short, opt-in anchors that keep renditions on-theme without dumping the
 *  full brief. Defensive optional access — partial briefs are fine. */
export function deriveBriefAnchors(brief: FlyerBriefLike | null | undefined): FlyerAnchor[] {
    if (!brief) return [];
    const anchors: FlyerAnchor[] = [];
    const push = (id: string, label: string, value?: string) => {
        const v = value?.trim();
        if (v) anchors.push({ id, label, text: `${label}: ${v}.` });
    };
    push('theme', 'Theme', brief.themeName);
    push('aesthetic', 'Aesthetic', brief.visual?.aestheticLabel);
    push('niche', 'Niche', brief.nicheSignals?.[0] ?? dossierNicheTitle(brief.campaignResearchDossier));
    return anchors;
}

export function deriveFlyerNicheHint(brief: FlyerBriefLike | null | undefined): string | null {
    if (!brief) return null;

    const candidates = [
        dossierNicheTitle(brief.campaignResearchDossier),
        brief.nicheSignals?.[0],
        brief.communityExpression?.corePromise,
        brief.communityExpression?.socialGravity,
        brief.researchRationale,
        brief.audienceSignals?.[0],
    ];

    const hint = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null;
    if (!hint) return null;

    return hint.length > 220 ? `${hint.slice(0, 217).trimEnd()}...` : hint;
}
