import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const ids = [
  'bp-cottagecore-infinity-2026-10n-grtr',
  'greek-isles-book-lovers-2026-09-26',
  'drift-festival-icon-2026'
];

const run = async () => {
  for (const id of ids) {
    const response = await fetch(`http://localhost:3000/api/groups/campaign/${id}`);
    const data = await response.json() as { campaign?: Record<string, unknown> };
    const c = data.campaign ?? {};
    console.log(JSON.stringify({
      id,
      name: c.name ?? null,
      targetDates: c.targetDates ?? null,
      matchedSailDate: c.matchedSailDate ?? null,
      aesthetic: c.aesthetic ?? null,
      vacationFitRationale: c.vacationFitRationale ?? null,
      cruiseNativeMoments: c.cruiseNativeMoments ?? [],
      implausibleLiteralizations: c.implausibleLiteralizations ?? [],
      allowedThemeSignals: c.allowedThemeSignals ?? [],
      discouragedThemeSignals: c.discouragedThemeSignals ?? [],
      optionalGatheringMoments: c.optionalGatheringMoments ?? [],
      solitudeRisks: c.solitudeRisks ?? []
    }, null, 2));
  }
};

run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
