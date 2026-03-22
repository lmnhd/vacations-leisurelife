/**
 * Phase 2C Diagnostic Breakdown
 *
 * Runs the Editor's Room landing-still pipeline directly so we can inspect
 * anchor compliance and production-build lint side by side before persistence.
 */

import { loadEnvConfig } from '@next/env';
import type { Campaign } from '../lib/campaigns/types';
import type { LandingStillSpec, ProductionBuildLintIssue, ProductionBuildStillDiagnostic } from '../lib/campaigns/schema';
import type { AnchorViolation } from '../lib/campaigns/editors-room';

loadEnvConfig(process.cwd());

const DEFAULT_CAMPAIGNS = [
    'bp-tabletop-icon-2027-7n-caribbean',
    'eastern-caribbean-stitch-sail-2026-09-19',
    'deck-sketchbook-society-2026',
];

function getRequestedCampaignSlugs(): string[] {
    const cliArgs = process.argv.slice(2).map(arg => arg.trim()).filter(Boolean);
    return cliArgs.length > 0 ? cliArgs : DEFAULT_CAMPAIGNS;
}

function groupAnchorViolationsByStill(violations: AnchorViolation[]): Map<string, AnchorViolation[]> {
    const grouped = new Map<string, AnchorViolation[]>();
    for (const violation of violations) {
        const current = grouped.get(violation.stillId) ?? [];
        current.push(violation);
        grouped.set(violation.stillId, current);
    }
    return grouped;
}

function groupLintIssuesByStill(issues: ProductionBuildLintIssue[]): Map<string, ProductionBuildLintIssue[]> {
    const grouped = new Map<string, ProductionBuildLintIssue[]>();
    for (const issue of issues) {
        for (const stillId of issue.affectedStillIds) {
            const current = grouped.get(stillId) ?? [];
            current.push(issue);
            grouped.set(stillId, current);
        }
    }
    return grouped;
}

function printAnchorSummary(anchors: Array<{ anchorId: string; locationFamily: string; nicheSignal: string; socialUnit: string; communityAction: string }>): void {
    console.log('\n🧭 ANCHORS:');
    anchors.forEach((anchor, index) => {
        console.log(`  ${index + 1}. ${anchor.anchorId}`);
        console.log(`     locationFamily: ${anchor.locationFamily}`);
        console.log(`     nicheSignal: ${anchor.nicheSignal}`);
        console.log(`     socialUnit: ${anchor.socialUnit}`);
        console.log(`     action: ${anchor.communityAction}`);
    });
}

function printStillBreakdown(
    stills: LandingStillSpec[],
    diagnostics: ProductionBuildStillDiagnostic[],
    anchorViolationsByStill: Map<string, AnchorViolation[]>,
    lintIssuesByStill: Map<string, ProductionBuildLintIssue[]>,
): void {
    console.log('\n🖼️ STILL-BY-STILL BREAKDOWN:');

    for (const still of stills) {
        const diagnostic = diagnostics.find(item => item.stillId === still.stillId);
        const anchorViolations = anchorViolationsByStill.get(still.stillId) ?? [];
        const lintIssues = lintIssuesByStill.get(still.stillId) ?? [];

        console.log(`\n  • ${still.stillId}`);
        console.log(`    slotRole: ${still.slotRole ?? '(missing)'} | usage: ${still.usage}`);
        console.log(`    anchorId: ${still.anchorId ?? '(missing)'} | nicheCarryThrough: ${still.nicheCarryThrough ?? '(missing)'}`);
        console.log(`    location: ${still.location}`);
        console.log(`    composition: ${still.composition}`);
        console.log(`    subjectAction: ${still.subjectAction}`);
        if (still.shotIntent) {
            console.log(`    shotIntent: ${still.shotIntent}`);
            console.log(`    camera: ${still.cameraDistance ?? '?'} | framing: ${still.framingMode ?? '?'} | heroSubject: ${still.heroSubject ?? '?'}`);
            console.log(`    nicheCue: ${still.nicheCue ?? '?'} | antiFallback: ${still.antiFallbackNote ?? '?'}`);
            console.log(`    refPack: ${still.referencePackId ?? '(none)'}`);
        }

        if (diagnostic) {
            console.log(`    lint: role=${diagnostic.shotRole} | cue=${diagnostic.cueStrength} | generic=${diagnostic.isGenericFallback ? 'yes' : 'no'}`);
            console.log(`    families: location=${diagnostic.locationFamily} | action=${diagnostic.actionFamily} | mood=${diagnostic.moodFamily} | composition=${diagnostic.compositionFamily}`);
            console.log(`    flags: ${diagnostic.flags.length > 0 ? diagnostic.flags.join(', ') : '(none)'}`);
        } else {
            console.log('    lint: no diagnostic found');
        }

        if (anchorViolations.length > 0) {
            console.log('    anchor violations:');
            anchorViolations.forEach((violation) => {
                console.log(`      - [${violation.violationType}] expected=${violation.expected} | actual=${violation.actual}`);
            });
        } else {
            console.log('    anchor violations: none');
        }

        if (lintIssues.length > 0) {
            console.log('    lint issues:');
            lintIssues.forEach((issue) => {
                console.log(`      - [${issue.code}] ${issue.message}`);
            });
        } else {
            console.log('    lint issues: none');
        }
    }
}

function printIssueSummary(anchorViolations: AnchorViolation[], lintIssues: ProductionBuildLintIssue[], diagnostics: ProductionBuildStillDiagnostic[]): void {
    const explicitCueCount = diagnostics.filter(item => item.cueStrength === 'explicit').length;
    const absentCueCount = diagnostics.filter(item => item.cueStrength === 'absent').length;
    const genericFallbackCount = diagnostics.filter(item => item.isGenericFallback).length;

    console.log('\n📊 SUMMARY:');
    console.log(`  Anchor violations: ${anchorViolations.length}`);
    console.log(`  Lint blockers: ${lintIssues.filter(issue => issue.severity === 'blocker').length}`);
    console.log(`  Explicit cue stills: ${explicitCueCount}/${diagnostics.length}`);
    console.log(`  No-cue stills: ${absentCueCount}/${diagnostics.length}`);
    console.log(`  Generic fallback stills: ${genericFallbackCount}/${diagnostics.length}`);

    if (anchorViolations.length > 0) {
        console.log('  Anchor violation codes:');
        [...new Set(anchorViolations.map(violation => violation.violationType))].forEach((code) => {
            console.log(`    - ${code}`);
        });
    }

    if (lintIssues.length > 0) {
        console.log('  Lint issue codes:');
        [...new Set(lintIssues.map(issue => issue.code))].forEach((code) => {
            console.log(`    - ${code}`);
        });
    }
}

async function inspectCampaign(campaign: Campaign): Promise<void> {
    const { generateAestheticBrief } = await import('../lib/campaigns/aesthetic-engine');
    const {
        generateActionAnchors,
        generateLandingStillBible,
        normalizeEditorialCompositions,
        validateAnchorCompliance,
    } = await import('../lib/campaigns/editors-room');
    const { lintProductionBuild } = await import('../lib/campaigns/media/production-build-lint');
    const { getExpandedNicheKeywords } = await import('../lib/campaigns/reference-packs');

    console.log(`\n🔍 DIAGNOSTIC: ${campaign.id}`);
    console.log('─'.repeat(50));
    console.log(`Campaign: ${campaign.name}`);

    const brief = await generateAestheticBrief(campaign);
    const anchors = await generateActionAnchors(campaign, brief);
    const rawBible = await generateLandingStillBible(campaign, brief, anchors);
    // Step 3.1: normalize editorial compositions (matches orchestrator)
    const landingStillBible = normalizeEditorialCompositions(rawBible);
    const anchorCompliance = validateAnchorCompliance(anchors.anchors, landingStillBible);
    const lint = lintProductionBuild({
        landingStillBible,
        themeName: campaign.name,
        nicheKeywords: getExpandedNicheKeywords(campaign),
    });

    const anchorViolationsByStill = groupAnchorViolationsByStill(anchorCompliance.violations);
    const lintIssuesByStill = groupLintIssuesByStill([...lint.blockingIssues, ...lint.warnings]);

    printAnchorSummary(anchors.anchors);
    printIssueSummary(anchorCompliance.violations, [...lint.blockingIssues, ...lint.warnings], lint.stillDiagnostics);
    printStillBreakdown(landingStillBible.stillLibrary, lint.stillDiagnostics, anchorViolationsByStill, lintIssuesByStill);
}

async function run(): Promise<void> {
    const { getCampaignBlueprint } = await import('../lib/campaigns/campaign-store');
    const slugs = getRequestedCampaignSlugs();

    console.log('🎯 PHASE 2C DIAGNOSTIC BREAKDOWN');
    console.log('Inspecting anchor compliance and lint diagnostics from the same generation pass');

    for (const slug of slugs) {
        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            console.log(`\n❌ Campaign not found: ${slug}`);
            continue;
        }

        try {
            await inspectCampaign(campaign);
        } catch (error) {
            console.log(`\n❌ Diagnostic failed for ${slug}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log('\n✅ Diagnostic breakdown completed');
}

run().catch(console.error);