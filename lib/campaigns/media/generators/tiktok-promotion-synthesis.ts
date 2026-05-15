import { callLLM } from '@/lib/ai/llm-gateway';
import { MEDIA_LLM_CONFIG } from '../media-pipeline-config';
import type { CampaignAestheticBrief, Storyboard, TikTokPromotionPackage } from '../../schema';
import { buildCampaignResearchDossierContext } from '../../research-context';

// ────────────────────────────────────────────────────────────────────────────
// TikTok Promotion Synthesis
//
// Late-stage LLM pass that reads the mature campaign state and extracts 6
// distinct promotional beats for the TikTok static-package renderer.
//
// Runs immediately before tiktok_seed_video generation.
// Stored on the manifest so it can be inspected and regenerated without
// re-running the full brief pipeline.
//
// Source priority (matches TIKTOK_PROMOTION_SYNTHESIS_PHASE_PLAN.md §8):
//   1. storyboard narration segments and emotional beats (shot-specific)
//   2. scene library descriptions and campaign-specific proof language
//   3. brief messaging, community expression, and social concepts
//
// Beat sequence for a 6-shot TikTok (preset cycle: hook → social → cta × 2):
//   1. hook      tag card at top — stops scroll in 1.5s
//   2. social    tag + statement — group energy + social proof
//   3. cta       statement + pill — first booking push
//   4. payoff    tag card at top — emotional peak or second angle
//   5. proof     tag + statement — credibility layer
//   6. cta       statement + pill — final close
// ────────────────────────────────────────────────────────────────────────────

function buildSynthesisPrompt(brief: CampaignAestheticBrief, storyboard: Storyboard): string {
    const shotNarrations = storyboard.shotSequence.map((shot, i) =>
        `Shot ${i + 1} (${shot.emotionalBeat}): "${shot.narrationSegment}"`
    ).join('\n');

    const sceneDescriptions = brief.productionBible?.sceneLibrary
        .slice(0, 8)
        .map((s) => `• ${s.sceneId}: ${s.imagePrompt.slice(0, 120)}`)
        .join('\n') ?? '';

    const props = brief.visual.plausibilityFramework.allowedProps.slice(0, 4).join(', ');
    const nicheHints = brief.visual.plausibilityFramework.nicheEnhancedMoments.slice(0, 3).join('; ');
    const belongingSignals = brief.communityExpression.belongingSignals.slice(0, 3).join('; ');
    const researchContext = buildCampaignResearchDossierContext(
        brief.campaignResearchDossier,
        'Secondary campaign research dossier (use to ground TikTok promotion beats in the niche trend and its specifics):',
    );

    return `You are the head copywriter for a boutique cruise promotion studio.

Your task: synthesize exactly 6 TikTok promotional beats for this campaign.
Each beat is one visual frame in a 35-second ad sequence.
The sequence cycles: hook → social → cta → payoff → proof → cta.

Campaign:
- Theme: ${brief.themeName}
- Hero slogan: ${brief.messaging.heroSlogan}
- Sub slogan: ${brief.messaging.subSlogan}
- TikTok hook: ${brief.socialConcepts.tiktokOrganic.hook}
- Elevator pitch: ${brief.messaging.elevatorPitch}
- Core community promise: ${brief.communityExpression.corePromise}
- Social gravity: ${brief.communityExpression.socialGravity}
- Copy framing rule: ${brief.communityExpression.copyFramingRule}
- Belonging signals: ${belongingSignals}
- Tone: ${brief.messaging.toneKeywords.slice(0, 4).join(', ')}
- Booking CTA: ${brief.messaging.ctaVariants.bookNow}
- Niche props visible: ${props}
- Niche moments: ${nicheHints}

${researchContext}

Storyboard narration (shot-specific copy already written for this campaign):
${shotNarrations}

Scene library (what the camera actually captures):
${sceneDescriptions}

Beat rules per role:

HOOK (positions 1 and 4 — tag card):
- headline: 3-8 words, first-person or confession-style, stops the scroll
- subline: one atmospheric line, sensory or emotional, ≤ 70 chars
- spokenText: the narration voice says this (2-10 words, spoken-quality)
- no badge needed

SOCIAL (position 2 — tag card on top + statement card on bottom):
- headline: the group energy claim, goes on the TOP tag card, ≤ 55 chars
- subline: a social proof or belonging statement, goes on the BOTTOM statement card, ≤ 75 chars
- spokenText: ties both cards together in narration

PROOF (position 5 — tag card on top + statement card on bottom):
- headline: a credibility claim, different wording from social beat, ≤ 55 chars
- subline: concrete proof or "you'll recognize these people" line, ≤ 75 chars
- spokenText: spoken narration for this beat

CTA (positions 3 and 6 — statement card + pill button):
- headline: campaign value proposition, confident, ≤ 60 chars — goes on STATEMENT card
- subline: supporting one-liner, ≤ 75 chars — goes below headline on statement card
- cta: the pill button label (3-5 words, action-forward) — REQUIRED for cta beats
- spokenText: what the voice says
- Position 3 is the first nudge; position 6 is the closer with stronger urgency

Critical constraints:
- NO beat should repeat another beat's headline verbatim
- Avoid reusing the hero slogan as the headline in more than one beat
- Do not use generic cruise phrases ("luxury", "dream vacation", "paradise", "escape", "discover")
- Every beat must feel campaign-specific — reference the niche, the group, or the table
- spokenText must sound like something a person would actually say aloud (not billboard copy)

Return ONLY valid JSON, no markdown fences. Schema:
{
  "strategySummary": "2-3 sentences on the editorial logic behind the sequence",
  "extractionNotes": ["note 1", "note 2", "note 3"],
  "beats": [
    { "role": "hook",    "headline": "", "subline": "", "spokenText": "" },
    { "role": "social",  "headline": "", "subline": "", "spokenText": "" },
    { "role": "cta",     "headline": "", "subline": "", "spokenText": "", "cta": "" },
    { "role": "payoff",  "headline": "", "subline": "", "spokenText": "" },
    { "role": "proof",   "headline": "", "subline": "", "spokenText": "" },
    { "role": "cta",     "headline": "", "subline": "", "spokenText": "", "cta": "" }
  ]
}`;
}

export async function generateTikTokPromotionPackage(
    brief: CampaignAestheticBrief,
    storyboard: Storyboard,
): Promise<TikTokPromotionPackage> {
    const model = MEDIA_LLM_CONFIG.tiktokPromotionSynthesis;
    const prompt = buildSynthesisPrompt(brief, storyboard);

    const systemPrompt = `You write TikTok ad copy for niche cruise campaigns.
Your output is always campaign-specific, phrase-distinct, and spoken-quality.
Return ONLY valid JSON — no markdown, no explanation.`;

    const { content } = await callLLM(model, prompt, {
        systemPrompt,
        maxTokens: 1800,
        temperature: 0.82,
    });

    const jsonStr = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const parsed = JSON.parse(jsonStr) as {
        strategySummary: string;
        extractionNotes: string[];
        beats: Array<{
            role: string;
            headline: string;
            subline: string;
            spokenText: string;
            badge?: string;
            cta?: string;
            sceneHint?: string;
        }>;
    };

    return {
        synthesizedAt: new Date().toISOString(),
        strategySummary: parsed.strategySummary ?? '',
        extractionNotes: Array.isArray(parsed.extractionNotes) ? parsed.extractionNotes : [],
        beats: parsed.beats.map((b) => ({
            role: b.role as TikTokPromotionPackage['beats'][number]['role'],
            headline: b.headline ?? '',
            subline: b.subline ?? '',
            spokenText: b.spokenText ?? '',
            badge: b.badge,
            cta: b.cta,
            sceneHint: b.sceneHint,
        })),
    };
}
