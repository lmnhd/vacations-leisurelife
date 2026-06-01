// lib/campaigns/media/asset-role-migration.ts
//
// Phase 0 (IMAGE_GEN_REVAMP_5-26): deterministic, idempotent role assignment.
//
// Existing AssetRecords have no eligibilityRole field. This module infers the
// correct role from each record's manifest section, then stamps the field.
// Records that already carry a role are left unchanged (idempotent).

import type { AssetEligibilityRole, AssetRecord, CampaignMediaManifest } from '../schema';
import type { ManifestAssetSection } from './asset-manifest-section';

// Maps each manifest section to its default eligibility role.
// Mirrors the Asset Eligibility Matrix in 06_WORKFLOW_DRIFT_AUDIT_REPORT.md.
const SECTION_DEFAULT_ROLE: Record<ManifestAssetSection, AssetEligibilityRole> = {
    hero:                  'source.hero_clean',
    flyerImages:           'source.flyer',
    aestheticConcepts:     'source.hero_clean',
    sceneImages:           'source.group_action',
    documentaryDetails:    'source.theme_detail',
    alternateArt:          'alternate_art',
    shipReferences:        'reference.audit_only',
    designedAdArtifacts:   'final.ad_artifact',
    tiktokSeed:            'final.channel_deliverable',
    heroExplainer:         'final.channel_deliverable',
    thresholdAnnouncement: 'final.channel_deliverable',
    countdown:             'final.channel_deliverable',
    broll:                 'final.channel_deliverable',
    ambientNarration:      'final.channel_deliverable',
    hypeClip:              'final.channel_deliverable',
    themeMusic:            'final.channel_deliverable',
    designs:               'source.theme_detail',
    mockups:               'source.theme_detail',
};

/** Infer the eligibility role for an asset stored in the given manifest section. */
export function inferEligibilityRole(section: ManifestAssetSection): AssetEligibilityRole {
    return SECTION_DEFAULT_ROLE[section];
}

function stampRole(asset: AssetRecord, section: ManifestAssetSection): AssetRecord {
    if (asset.eligibilityRole !== undefined) return asset;
    return { ...asset, eligibilityRole: inferEligibilityRole(section) };
}

function stampAll(assets: AssetRecord[], section: ManifestAssetSection): AssetRecord[] {
    return assets.map((a) => stampRole(a, section));
}

function stampOne(asset: AssetRecord | null, section: ManifestAssetSection): AssetRecord | null {
    if (!asset) return null;
    return stampRole(asset, section);
}

/**
 * Return a new manifest where every AssetRecord carries an eligibilityRole.
 * Records that already have a role are untouched (idempotent).
 */
export function migrateManifestRoles(manifest: CampaignMediaManifest): CampaignMediaManifest {
    const img = manifest.images;

    const migratedPlatformCrops: typeof img.platformCrops = {};
    for (const [fmt, crops] of Object.entries(img.platformCrops ?? {})) {
        migratedPlatformCrops[fmt as keyof typeof img.platformCrops] =
            (crops ?? []).map((a) =>
                a.eligibilityRole !== undefined
                    ? a
                    : { ...a, eligibilityRole: 'source.hero_clean' as AssetEligibilityRole }
            );
    }

    return {
        ...manifest,
        images: {
            ...img,
            hero:                stampAll(img.hero ?? [], 'hero'),
            aestheticConcepts:   stampAll(img.aestheticConcepts ?? [], 'aestheticConcepts'),
            sceneImages:         stampAll(img.sceneImages ?? [], 'sceneImages'),
            documentaryDetails:  stampAll(img.documentaryDetails ?? [], 'documentaryDetails'),
            alternateArt:        stampAll(img.alternateArt ?? [], 'alternateArt'),
            shipReferences:      stampAll(img.shipReferences ?? [], 'shipReferences'),
            designedAdArtifacts: stampAll(img.designedAdArtifacts ?? [], 'designedAdArtifacts'),
            platformCrops:       migratedPlatformCrops,
        },
        videos: {
            tiktokSeed:            stampOne(manifest.videos.tiktokSeed, 'tiktokSeed'),
            heroExplainer:         stampOne(manifest.videos.heroExplainer, 'heroExplainer'),
            thresholdAnnouncement: stampOne(manifest.videos.thresholdAnnouncement, 'thresholdAnnouncement'),
            countdown:             stampAll(manifest.videos.countdown ?? [], 'countdown'),
            broll:                 stampAll(manifest.videos.broll ?? [], 'broll'),
        },
        audio: {
            ambientNarration: stampOne(manifest.audio.ambientNarration, 'ambientNarration'),
            hypeClip:         stampOne(manifest.audio.hypeClip, 'hypeClip'),
            themeMusic:       stampOne(manifest.audio.themeMusic, 'themeMusic'),
        },
        merch: {
            ...manifest.merch,
            designs: stampAll(manifest.merch.designs ?? [], 'designs'),
            mockups:  stampAll(manifest.merch.mockups ?? [], 'mockups'),
        },
    };
}
