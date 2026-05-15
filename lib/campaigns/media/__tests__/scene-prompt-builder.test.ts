import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, SceneSpec } from '../../schema';
import { buildSceneImagePrompt } from '../generators/stability-generator';

async function main() {
    let passedCount = 0;
    let failedCount = 0;

    async function test(label: string, fn: () => Promise<void> | void): Promise<void> {
        try {
            await fn();
            console.log(`PASS ${label}`);
            passedCount++;
        } catch (err) {
            console.error(`FAIL ${label}`);
            console.error(`  ${err instanceof Error ? err.message : String(err)}`);
            failedCount++;
        }
    }

    await test('scene prompt carries action, environment, and research guidance into the final image prompt', () => {
        const scene: SceneSpec = {
            sceneId: 'theater',
            location: 'Main theater interior before evening program',
            timeOfDay: 'Early evening',
            lighting: 'Soft ambient house lights, no stage spotlight',
            cameraAngle: 'Over-the-shoulder',
            subjectAction: 'Two guests settle into their seats with relaxed shoulders, treating the space as a quiet pause before the evening begins',
            environmentDetails: 'A ceramic mug sits in the cup holder beside a folded shawl while the closed curtain keeps the room calm and low-stimulus',
            mood: 'belonging',
            imagePrompt: 'Main theater on Icon of the Seas with closed curtain and a low-pressure decompression mood instead of entertainment spectacle',
            referenceCategory: 'theater',
        };

        const brief = {
            themeName: 'Wellness and Nature Cruise',
            campaignResearchDossier: {
                nicheResearch: {
                    nicheTitle: 'Soft-Structured Wellness & Nature Ritual Culture',
                    trendCycleSummary: 'Consumers favor repeatable micro-practices over extreme resets.',
                    whyThisTrendFeelsDistinctNow: 'The tone is invitational rather than corrective.',
                    audienceRoutineInsights: [
                        'Morning light exposure within 10 minutes of waking.',
                        'Breathwork integrated into daily life.',
                        'Analog journaling and herbal beverages as wind-down rituals.',
                    ],
                    specificExamples: [],
                    allowedSignals: ['Ceramic mugs with visible steam at sunrise', 'Handwritten journals with dated entries'],
                    discouragedSignals: ['Guru-on-a-stage energy', 'Hyper-athletic yoga poses as the dominant visual'],
                    sourceNotes: [],
                },
                cruiseTranslation: {
                    cruiseNativeTranslationNotes: [],
                    downstreamImplications: {
                        briefDirection: [
                            'Visual palette: sea glass, sand, linen white, muted sage.',
                        ],
                        mediaGeneration: [
                            'Storyboard micro-rituals instead of grand activities.',
                            'Use slow pans and steady tripod shots to evoke regulation.',
                        ],
                        copyDirection: [
                            'Lead with invitational language and autonomy.',
                        ],
                    },
                },
            },
            messaging: {
                heroSlogan: 'Reset by Sea.',
                elevatorPitch: 'Quiet ship life with optional wellness rituals.',
            },
            visual: {
                aestheticLabel: 'Soft-Structured Sea Ritual',
                humanRepresentation: { minimumVisiblePeople: 3 },
            },
        } as unknown as CampaignAestheticBrief;

        const prompt = buildSceneImagePrompt(scene, 'Icon of the Seas', brief, ['Ceramic mugs', 'Light shawls']);

        assert.match(prompt, /Primary scene action from the Production Bible/i);
        assert.match(prompt, /Environmental detail anchors/i);
        assert.match(prompt, /Guru-on-a-stage energy/i);
        assert.match(prompt, /low-pressure decompression/i);
        assert.match(prompt, /Ceramic mugs/i);
        assert.match(prompt, /Icon of the Seas/i);
    });

    if (failedCount > 0) {
        throw new Error(`${failedCount} scene prompt builder test(s) failed`);
    }

    console.log(`\n${passedCount} scene prompt builder tests passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
