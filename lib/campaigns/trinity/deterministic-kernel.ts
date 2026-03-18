import { CampaignAestheticBriefSchema, ProductionBibleSchema } from '../schema';
import { MINIMUM_CAMPAIGN_LEAD_DAYS, getLaunchWindowAssessment } from '../launch-window';
import type { Campaign } from '../types';
import type { CampaignAestheticBrief, ProductionBible } from '../schema';
import type { DeterministicKernelContract } from './types';

export class TrinityKernelError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TrinityKernelError';
    }
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new TrinityKernelError(message);
    }
}

function containsImpossibleCameraMove(bible: ProductionBible): boolean {
    const text = JSON.stringify({
        storyboards: bible.storyboards,
        sceneLibrary: bible.sceneLibrary,
    });

    return /\bcrane\b|\bdolly\b|\btrack(?:ing)?\s+shot\b|\bslider\b|\bcable\s+cam\b/i.test(text);
}

function containsCabinContradiction(bible: ProductionBible): boolean {
    const text = JSON.stringify(bible.sceneLibrary);

    return /interior\s+stateroom[^.]{0,80}(window|ocean|sea\s+view)|(window|ocean|sea\s+view)[^.]{0,80}interior\s+stateroom/i.test(text);
}

function containsGangwayExchange(bible: ProductionBible): boolean {
    const text = JSON.stringify({
        storyboards: bible.storyboards,
        sceneLibrary: bible.sceneLibrary,
    });

    return /exchange.*gangway|gangway.*exchange|handoff.*gangway/i.test(text);
}

function hasMisalignedStoryboardDurations(bible: ProductionBible): boolean {
    return bible.storyboards.some((storyboard) => {
        const total = storyboard.shotSequence.reduce((sum, shot) => sum + shot.durationSeconds, 0);
        return total !== storyboard.totalDurationSeconds;
    });
}

function hasProductionSafetyOps(bible: ProductionBible): boolean {
    return bible.globalDirectionNotes.includes(
        'Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded.',
    );
}

export const trinityDeterministicKernel: DeterministicKernelContract = {
    validateCampaignContext(campaign: Campaign): void {
        assert(!!campaign.id, 'Campaign context missing id.');
        assert(!!campaign.name, 'Campaign context missing name.');
        assert(!!campaign.targetDates, 'Campaign context missing targetDates.');

        const launchWindow = getLaunchWindowAssessment({
            matchedSailDate: campaign.matchedSailDate,
            targetDates: campaign.targetDates,
        });

        assert(
            launchWindow.meetsMinimumLeadTime !== false,
            `Campaign violates minimum lead window of ${MINIMUM_CAMPAIGN_LEAD_DAYS} days.`,
        );
    },

    assertBriefValidity(brief: CampaignAestheticBrief): void {
        CampaignAestheticBriefSchema.parse(brief);
        assert(brief.slug.length > 0, 'Brief slug is required.');
        assert(brief.themeName.length > 0, 'Brief themeName is required.');
    },

    assertProductionBibleFeasibility(bible: ProductionBible): void {
        ProductionBibleSchema.parse(bible);
        assert(!containsImpossibleCameraMove(bible), 'Production bible contains impossible camera movement.');
        assert(!containsCabinContradiction(bible), 'Production bible contains interior-window cabin contradiction.');
        assert(!containsGangwayExchange(bible), 'Production bible contains gangway exchange choreography.');
        assert(!hasMisalignedStoryboardDurations(bible), 'Production bible storyboard durations are misaligned.');
        assert(hasProductionSafetyOps(bible), 'Production bible missing required safety-ops language.');
    },
};
