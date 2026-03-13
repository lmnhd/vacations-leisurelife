import { appendFileSync, writeFileSync } from 'node:fs';
import { getCampaignBlueprint } from '../../lib/campaigns/campaign-store';
import { generateAestheticBrief } from '../../lib/campaigns/aesthetic-engine';

const defaultSlugs = [
  'needle-drop-2026',
  'deck-and-dice-2026',
  'sea-of-stories-2026',
  'sundown-spirits-2026',
] as const;

const flaggedPatterns = [
  'ritual',
  'spotlight',
  'swap hour',
  'open library',
  'library',
  'shelf',
  'shared shelf',
  'leave-one',
  'take-one',
  'looking for players',
  'teach-and-play',
  'salon',
  'influencer',
  'hosted',
  'session',
  'workshop',
  'activation',
  'station',
  'classroom',
  'badge',
  'lanyard',
  'eclipse',
  'moonshadow',
] as const;

async function main() {
  const outputPath = 'tmp/verification/check-event-framing-output.jsonl';
  const requestedSlugs = process.argv.slice(2);
  const slugs = requestedSlugs.length > 0 ? requestedSlugs : [...defaultSlugs];

  writeFileSync(outputPath, '');

  for (const slug of slugs) {
    const campaign = await getCampaignBlueprint(slug);

    if (!campaign) {
      appendFileSync(outputPath, `${JSON.stringify({ slug, error: 'campaign not found' })}\n`);
      continue;
    }

    const brief = await generateAestheticBrief(campaign);
    const serialized = JSON.stringify(brief).toLowerCase();
    const flaggedTerms = flaggedPatterns.filter((pattern) => serialized.includes(pattern));

    appendFileSync(
      outputPath,
      `${JSON.stringify({
        slug,
        heroSlogan: brief.messaging.heroSlogan,
        subSlogan: brief.messaging.subSlogan,
        elevatorPitch: brief.messaging.elevatorPitch,
        governingPrinciple: brief.visual.plausibilityFramework.governingPrinciple,
        tiktokHook: brief.socialConcepts.tiktokOrganic.hook,
        facebookText: brief.socialConcepts.facebookAd.primaryText,
        flaggedTerms,
      })}\n`
    );
  }

  console.log(outputPath);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});