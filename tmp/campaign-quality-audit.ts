import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const run = async () => {
  const response = await fetch('http://localhost:3000/api/groups/discovery?load=true');
  const data = await response.json() as { campaigns?: Array<{ id: string; pricingStatus?: string; aestheticBriefStatus?: string | null }> };
  const campaigns = (Array.isArray(data.campaigns) ? data.campaigns : []).filter((c) => c.pricingStatus === 'CB_MATCHED');

  const rows: Array<Record<string, unknown>> = [];

  for (const campaign of campaigns) {
    const [campaignRes, readinessRes, aestheticRes] = await Promise.all([
      fetch(`http://localhost:3000/api/groups/campaign/${campaign.id}`),
      fetch(`http://localhost:3000/api/groups/campaign/${campaign.id}/brief/readiness`),
      fetch(`http://localhost:3000/api/groups/campaign/${campaign.id}/media/aesthetic`),
    ]);

    const campaignBody = await campaignRes.json().catch(() => ({}));
    const readinessBody = await readinessRes.json().catch(() => ({}));
    const aestheticBody = await aestheticRes.json().catch(() => ({}));

    const campaignData = (campaignBody as { campaign?: Record<string, unknown> }).campaign ?? {};
    const hasBrief = aestheticRes.ok && !(aestheticBody as { error?: string }).error;
    const briefData = ((aestheticBody as { brief?: Record<string, unknown> }).brief ?? aestheticBody) as Record<string, unknown>;

    rows.push({
      id: campaign.id,
      pricingStatus: campaign.pricingStatus ?? null,
      storedBriefStatus: campaign.aestheticBriefStatus ?? null,
      readiness: (readinessBody as { readiness?: string }).readiness ?? null,
      hasBrief,
      briefStatus: hasBrief ? (briefData.humanReviewStatus ?? null) : null,
      targetDates: (campaignData.targetDates as string | undefined) ?? null,
      matchedSailDate: (campaignData.matchedSailDate as string | undefined) ?? null,
      launchMeetsMinimum: (campaignData.meetsMinimumLeadTime as boolean | null | undefined) ?? null,
      launchDaysUntil: (campaignData.daysUntilSail as number | null | undefined) ?? null,
    });
  }

  const summary = {
    totalCbMatched: rows.length,
    readinessCounts: rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.readiness ?? 'unknown');
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    briefStatusCounts: rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.briefStatus ?? 'none');
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    nonCompliantLaunch: rows.filter((row) => row.launchMeetsMinimum === false),
    noBrief: rows.filter((row) => !row.hasBrief).map((row) => row.id),
  };

  console.log(JSON.stringify({ summary, campaigns: rows }, null, 2));
};

run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
