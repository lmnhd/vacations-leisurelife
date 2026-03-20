import { loadEnvConfig } from '@next/env';
import { writeFileSync } from 'node:fs';

loadEnvConfig(process.cwd());

const ids = [
  'bp-cottagecore-infinity-2026-10n-grtr',
  'greek-isles-book-lovers-2026-09-26',
  'film-and-zine-afloat-2026'
];

const run = async () => {
  const results = [];

  for (const id of ids) {
    const [campaignRes, briefRes, readinessRes, validateRes] = await Promise.all([
      fetch(`http://localhost:3000/api/groups/campaign/${id}`),
      fetch(`http://localhost:3000/api/groups/campaign/${id}/media/aesthetic`),
      fetch(`http://localhost:3000/api/groups/campaign/${id}/brief/readiness`),
      fetch(`http://localhost:3000/api/groups/campaign/${id}/media/aesthetic/validate`, { method: 'POST' }),
    ]);

    const campaignBody = await campaignRes.json().catch(() => ({}));
    const briefBody = await briefRes.json().catch(() => ({}));
    const readinessBody = await readinessRes.json().catch(() => ({}));
    const validateBody = await validateRes.json().catch(() => ({}));

    const campaign = (campaignBody as { campaign?: Record<string, unknown> }).campaign ?? {};
    const brief = ((briefBody as { brief?: Record<string, unknown> }).brief ?? briefBody) as Record<string, any>;
    const productionBible = (brief.productionBible ?? {}) as Record<string, any>;
    const firstScene = Array.isArray(productionBible.sceneLibrary) ? productionBible.sceneLibrary[0] ?? null : null;

    results.push({
      id,
      campaignName: campaign.name ?? null,
      readiness: (readinessBody as { readiness?: string }).readiness ?? null,
      briefStatus: brief.humanReviewStatus ?? null,
      heroSlogan: brief.messaging?.heroSlogan ?? null,
      elevatorPitch: brief.messaging?.elevatorPitch ?? null,
      imageryMood: brief.visual?.imageryMood ?? null,
      compositionNotes: brief.visual?.compositionNotes ?? null,
      avoidList: brief.visual?.avoidList ?? [],
      corePromise: brief.communityExpression?.corePromise ?? null,
      optionalGatherings: brief.communityExpression?.optionalGatherings ?? [],
      sceneCount: Array.isArray(productionBible.sceneLibrary) ? productionBible.sceneLibrary.length : 0,
      firstScene,
      validateSummary: {
        verdict: (validateBody as any).redTeamVerdict ?? null,
        totalIssues: (validateBody as any).summary?.totalIssues ?? null,
        blockerCount: (validateBody as any).summary?.blockerCount ?? null,
        warningCount: (validateBody as any).summary?.warningCount ?? null,
      }
    });
  }

  writeFileSync('./tmp/brief-review-audit.json', JSON.stringify(results, null, 2));
  console.log('wrote tmp/brief-review-audit.json');
};

run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
