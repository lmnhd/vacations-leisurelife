import { normalizeCampaignResearchDossier, type CampaignResearchDossierLike } from './schema';

function buildListSection(title: string, items: string[] | undefined): string {
    const lines = (items ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `- ${item}`);

    if (lines.length === 0) {
        return '';
    }

    return [title, ...lines].join('\n');
}

export function buildCampaignResearchDossierContext(
    dossier: CampaignResearchDossierLike,
    heading = 'Secondary campaign research dossier:'
): string {
    const normalized = normalizeCampaignResearchDossier(dossier);
    if (!normalized) {
        return '';
    }

    return [
        heading,
        'Niche research:',
        `- Niche title: ${normalized.nicheResearch.nicheTitle}`,
        `- Trend cycle summary: ${normalized.nicheResearch.trendCycleSummary}`,
        `- Why this trend feels distinct now: ${normalized.nicheResearch.whyThisTrendFeelsDistinctNow}`,
        buildListSection('- Audience routine insights:', normalized.nicheResearch.audienceRoutineInsights),
        buildListSection('- Specific examples:', normalized.nicheResearch.specificExamples),
        buildListSection('- Allowed signals:', normalized.nicheResearch.allowedSignals),
        buildListSection('- Discouraged signals:', normalized.nicheResearch.discouragedSignals),
        buildListSection('- Source notes:', normalized.nicheResearch.sourceNotes),
        'Cruise translation:',
        buildListSection('- Cruise-native translation notes:', normalized.cruiseTranslation.cruiseNativeTranslationNotes),
        buildListSection('- Brief direction implications:', normalized.cruiseTranslation.downstreamImplications.briefDirection),
        buildListSection('- Media generation implications:', normalized.cruiseTranslation.downstreamImplications.mediaGeneration),
        buildListSection('- Copy direction implications:', normalized.cruiseTranslation.downstreamImplications.copyDirection),
    ]
        .filter(Boolean)
        .join('\n');
}
