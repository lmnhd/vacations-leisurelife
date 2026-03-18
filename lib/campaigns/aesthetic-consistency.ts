import { randomUUID } from 'crypto';
import type { CampaignAestheticBrief, AestheticIssueRecord } from './schema';

// ────────────────────────────────────────────────────────────────────────────
// Camera move banned token detection
// ────────────────────────────────────────────────────────────────────────────

const BANNED_CAMERA_TOKENS = /\b(crane|dolly|slider|cable\s*cam|tracking\s+shot)\b/i;

function detectBannedCameraMoves(text: string): boolean {
    BANNED_CAMERA_TOKENS.lastIndex = 0;
    return BANNED_CAMERA_TOKENS.test(text);
}

// ────────────────────────────────────────────────────────────────────────────
// Check: storyboard durations match videoConcepts authoritative durations
// ────────────────────────────────────────────────────────────────────────────

const DELIVERABLE_ID_MAP: Record<string, keyof CampaignAestheticBrief['videoConcepts']> = {
    tiktok_seed: 'tiktokSeed',
    hero_explainer: 'heroExplainer',
    threshold_announcement: 'thresholdAnnouncement',
    merch_reveal: 'merchReveal',
};

function checkStoryboardDurationAlignment(brief: CampaignAestheticBrief): AestheticIssueRecord[] {
    if (!brief.productionBible) return [];

    const issues: AestheticIssueRecord[] = [];

    for (const storyboard of brief.productionBible.storyboards) {
        const conceptKey = DELIVERABLE_ID_MAP[storyboard.deliverableId];
        if (!conceptKey) continue;

        const videoConcept = brief.videoConcepts[conceptKey] as { durationSeconds: number };
        const authoritative = videoConcept.durationSeconds;
        const actual = storyboard.totalDurationSeconds;

        if (actual === authoritative) continue;

        const shotTotal = storyboard.shotSequence.reduce((sum, shot) => sum + shot.durationSeconds, 0);
        const evidence: string[] = [
            `Storyboard "${storyboard.deliverableId}" declares totalDurationSeconds=${actual} but videoConcepts.${conceptKey} declares ${authoritative}s`,
        ];
        if (shotTotal !== actual) {
            evidence.push(`Shot sequence sums to ${shotTotal}s, not ${actual}s`);
        }

        issues.push({
            issueId: randomUUID(),
            issueCode: 'storyboard_duration_alignment',
            severity: 'blocker',
            title: `Storyboard duration mismatch: ${storyboard.deliverableId}`,
            summary: `Storyboard totalDurationSeconds (${actual}s) does not match videoConcepts authoritative duration (${authoritative}s)`,
            evidence,
            owningArtifact: 'production_bible',
            targetPaths: ['productionBible.storyboards'],
            remediationMode: 'deterministic',
            closureChecks: [
                `storyboard.totalDurationSeconds === videoConcepts.${conceptKey}.durationSeconds`,
                'Shot sequence durations sum to storyboard total',
            ],
            invalidates: {
                redTeamReview: false,
                productionBible: false,
                landingStillBible: false,
                productionBuildLint: false,
            },
            status: 'open',
            createdAt: new Date().toISOString(),
        });
    }

    return issues;
}

// ────────────────────────────────────────────────────────────────────────────
// Check: scene IDs referenced in storyboards exist in sceneLibrary
// ────────────────────────────────────────────────────────────────────────────

function checkSceneIdIntegrity(brief: CampaignAestheticBrief): AestheticIssueRecord[] {
    if (!brief.productionBible) return [];

    const sceneIds = new Set(brief.productionBible.sceneLibrary.map(s => s.sceneId));
    const issues: AestheticIssueRecord[] = [];

    for (const storyboard of brief.productionBible.storyboards) {
        const missingIds: string[] = [];
        for (const shot of storyboard.shotSequence) {
            if (shot.sceneId && !sceneIds.has(shot.sceneId)) {
                missingIds.push(shot.sceneId);
            }
        }
        if (missingIds.length === 0) continue;

        issues.push({
            issueId: randomUUID(),
            issueCode: 'custom',
            severity: 'blocker',
            title: `Orphaned scene IDs in storyboard: ${storyboard.deliverableId}`,
            summary: 'Shots reference scene IDs that do not exist in the production bible scene library',
            evidence: [`Missing scene IDs: ${[...new Set(missingIds)].join(', ')}`],
            owningArtifact: 'cross_artifact',
            targetPaths: ['productionBible.storyboards', 'productionBible.sceneLibrary'],
            remediationMode: 'regenerate',
            closureChecks: ['All shot sceneId values exist in productionBible.sceneLibrary'],
            invalidates: {
                redTeamReview: false,
                productionBible: true,
                landingStillBible: false,
                productionBuildLint: false,
            },
            status: 'open',
            createdAt: new Date().toISOString(),
        });
    }

    return issues;
}

// ────────────────────────────────────────────────────────────────────────────
// Check: banned camera moves still present after a prior deterministic fix
// ────────────────────────────────────────────────────────────────────────────

function checkCrossArtifactCameraMove(brief: CampaignAestheticBrief): AestheticIssueRecord[] {
    if (!brief.productionBible) return [];

    const bannedInBrief = detectBannedCameraMoves(JSON.stringify(brief.videoConcepts));
    const bannedInSceneLibrary = brief.productionBible.sceneLibrary.some(
        scene => detectBannedCameraMoves(scene.cameraAngle),
    );
    const bannedInStoryboards = brief.productionBible.storyboards.some(storyboard =>
        storyboard.shotSequence.some(shot => detectBannedCameraMoves(shot.cameraMovement)),
    );

    const offendingLocations: string[] = [];
    if (bannedInBrief) offendingLocations.push('videoConcepts');
    if (bannedInSceneLibrary) offendingLocations.push('productionBible.sceneLibrary');
    if (bannedInStoryboards) offendingLocations.push('productionBible.storyboards');

    if (offendingLocations.length === 0) return [];

    return [
        {
            issueId: randomUUID(),
            issueCode: 'camera_move_feasibility',
            severity: 'blocker',
            title: 'Banned camera move tokens persist across artifacts',
            summary: 'Crane/dolly/slider/cable cam language was not fully removed from all artifacts in the same remediation cycle',
            evidence: [`Found in: ${offendingLocations.join(', ')}`],
            owningArtifact: 'cross_artifact',
            targetPaths: offendingLocations,
            remediationMode: 'deterministic',
            closureChecks: [
                'No crane/dolly/track/slider/cable-cam tokens in videoConcepts',
                'No crane/dolly/track/slider/cable-cam tokens in productionBible.sceneLibrary',
                'No crane/dolly/track/slider/cable-cam tokens in productionBible.storyboards',
            ],
            invalidates: {
                redTeamReview: true,
                productionBible: false,
                landingStillBible: false,
                productionBuildLint: false,
            },
            status: 'open',
            createdAt: new Date().toISOString(),
        },
    ];
}

// ────────────────────────────────────────────────────────────────────────────
// Check: avoidDirectives in brief vs productionBible are not contradicted
// ────────────────────────────────────────────────────────────────────────────

function checkAvoidDirectiveAlignment(brief: CampaignAestheticBrief): AestheticIssueRecord[] {
    if (!brief.productionBible) return [];

    const briefAvoidTerms = (brief.visual.avoidList ?? []).map(s => s.toLowerCase());
    const bibleAvoidTerms = (brief.productionBible.avoidDirectives ?? []).map(s => s.toLowerCase());

    const missingFromBible = briefAvoidTerms.filter(
        term => !bibleAvoidTerms.some(bibleItem => bibleItem.includes(term.split(' ')[0])),
    );

    if (missingFromBible.length === 0) return [];

    return [
        {
            issueId: randomUUID(),
            issueCode: 'custom',
            severity: 'warning',
            title: 'Brief avoidList terms absent from productionBible avoidDirectives',
            summary: 'Some terms in the brief visual.avoidList are not reflected in the production bible avoidDirectives',
            evidence: [`Terms in brief but not in bible: ${missingFromBible.slice(0, 5).join(', ')}`],
            owningArtifact: 'cross_artifact',
            targetPaths: ['productionBible.avoidDirectives'],
            remediationMode: 'llm_patch',
            closureChecks: ['productionBible.avoidDirectives references the same categories as visual.avoidList'],
            invalidates: {
                redTeamReview: false,
                productionBible: false,
                landingStillBible: false,
                productionBuildLint: false,
            },
            status: 'open',
            createdAt: new Date().toISOString(),
        },
    ];
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export function runCrossArtifactConsistencyChecks(brief: CampaignAestheticBrief): AestheticIssueRecord[] {
    return [
        ...checkStoryboardDurationAlignment(brief),
        ...checkSceneIdIntegrity(brief),
        ...checkCrossArtifactCameraMove(brief),
        ...checkAvoidDirectiveAlignment(brief),
    ];
}
