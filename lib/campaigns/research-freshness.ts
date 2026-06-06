export function isResearchDossierNewerThanBrief(
  campaign: { researchDossierGeneratedAt?: string | null },
  brief?: { generatedAt?: string | null } | null,
): boolean {
  if (!campaign.researchDossierGeneratedAt || !brief?.generatedAt) {
    return false;
  }

  const researchAt = Date.parse(campaign.researchDossierGeneratedAt);
  const briefAt = Date.parse(brief.generatedAt);
  if (Number.isNaN(researchAt) || Number.isNaN(briefAt)) {
    return false;
  }

  return researchAt > briefAt;
}

export function formatStaleBriefForResearchMessage(slug: string): string {
  return (
    `The secondary research dossier for ${slug} is newer than the saved brief. ` +
    `Regenerate the brief in Brief Studio so the landing stills and Production Bible absorb the latest research before approval or media generation.`
  );
}
