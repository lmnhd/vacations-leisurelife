import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief, getCampaignBlueprint, saveAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest, saveMediaManifest, upsertManifestAssetSection } from '@/lib/campaigns/media/media-store';
import { getDirective, updateDirectiveStatus } from '@/lib/campaigns/directive-store';
import { listDirectives } from '@/lib/campaigns/directive-store';
import { patchBriefForDirective, mergeActiveDirectivePatches } from '@/lib/campaigns/directive-patch';
import { generateDesignedAdArtifactPack } from '@/lib/campaigns/media/generators/ad-artifact-generator';
import { generateHeroImages, generateAestheticConcepts } from '@/lib/campaigns/media/generators/stability-generator';
import { getMediaImageGeneratorService } from '@/lib/campaigns/media/media-pipeline-config';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import type { AssetRecord } from '@/lib/campaigns/schema';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string; id: string }> },
) {
    const { slug, id } = await params;
    const now = new Date().toISOString();

    try {
        const [directive, brief, campaign, manifest, allDirectives] = await Promise.all([
            getDirective(slug, id),
            getAestheticBrief(slug),
            getCampaignBlueprint(slug),
            getMediaManifest(slug),
            listDirectives(slug),
        ]);

        if (!directive) {
            return NextResponse.json({ error: `Directive not found: ${id}` }, { status: 404 });
        }
        if (!brief) {
            return NextResponse.json({ error: `Brief not found for campaign: ${slug}` }, { status: 404 });
        }
        if (!campaign) {
            return NextResponse.json({ error: `Campaign not found: ${slug}` }, { status: 404 });
        }
        if (directive.status === 'applied') {
            return NextResponse.json({ error: 'Directive already applied. Create a new directive to make further changes.' }, { status: 409 });
        }

        console.log(`[directives:apply] Applying ${id} for ${slug} - scope: ${directive.scope.join(', ')}`);

        const previouslyApplied = allDirectives.filter((d) => d.status === 'applied');
        const mergedPatch = mergeActiveDirectivePatches([...previouslyApplied, { ...directive, status: 'applied' }]);
        const patchedBrief = patchBriefForDirective(brief, mergedPatch);

        const shipName = campaign.shipTarget ?? 'Selected vessel';
        const scope = new Set(directive.scope);
        const staleIds = new Set(directive.affectedAssetIds);
        const regenerated: AssetRecord[] = [];

        if ((scope.has('heroes') || scope.has('still_bible')) && staleIds.size > 0) {
            const staleHeroes = (manifest?.images.hero ?? []).filter((a) => staleIds.has(a.assetId));
            const count = Math.max(staleHeroes.length, 1);

            try {
                const generated = await generateHeroImages(patchedBrief, shipName, count);
                const newRecords: AssetRecord[] = [];
                for (let index = 0; index < generated.length; index += 1) {
                    const img = generated[index];
                    const url = await uploadAsset(slug, img.fileName, img.buffer, 'image/png');
                    const record: AssetRecord = {
                        assetId: img.assetId,
                        assetType: 'hero_image',
                        url,
                        generator: getMediaImageGeneratorService(),
                        promptUsed: img.prompt,
                        fileSizeBytes: img.buffer.length,
                        mimeType: 'image/png',
                        tags: ['hero', `directive:${id}`],
                        createdAt: now,
                        reviewStatus: 'needs_review',
                        version: (staleHeroes[index]?.version ?? 0) + 1,
                        active: true,
                    };
                    await saveAssetRecord(slug, record);
                    newRecords.push(record);
                }

                await upsertManifestAssetSection(slug, 'hero', newRecords);
                regenerated.push(...newRecords);
                console.log(`[directives:apply] Regenerated ${newRecords.length} hero(s)`);
            } catch (error) {
                console.error('[directives:apply] Hero generation failed:', error);
            }
        }

        if (scope.has('concepts') && staleIds.size > 0) {
            const staleConcepts = (manifest?.images.aestheticConcepts ?? []).filter((a) => staleIds.has(a.assetId));
            const count = Math.max(staleConcepts.length, 1);

            try {
                const generated = await generateAestheticConcepts(patchedBrief, count);
                const newRecords: AssetRecord[] = [];
                for (let index = 0; index < generated.length; index += 1) {
                    const img = generated[index];
                    const url = await uploadAsset(slug, img.fileName, img.buffer, 'image/png');
                    const record: AssetRecord = {
                        assetId: img.assetId,
                        assetType: 'aesthetic_concept',
                        url,
                        generator: getMediaImageGeneratorService(),
                        promptUsed: img.prompt,
                        fileSizeBytes: img.buffer.length,
                        mimeType: 'image/png',
                        tags: ['concept', `directive:${id}`],
                        createdAt: now,
                        reviewStatus: 'needs_review',
                        version: (staleConcepts[index]?.version ?? 0) + 1,
                        active: true,
                    };
                    await saveAssetRecord(slug, record);
                    newRecords.push(record);
                }

                await upsertManifestAssetSection(slug, 'aestheticConcepts', newRecords);
                regenerated.push(...newRecords);
                console.log(`[directives:apply] Regenerated ${newRecords.length} concept(s)`);
            } catch (error) {
                console.error('[directives:apply] Concept generation failed:', error);
            }
        }

        if ((scope.has('documentary_details') || scope.has('designed_ads') || scope.has('prop_families')) && staleIds.size > 0) {
            try {
                const result = await generateDesignedAdArtifactPack(slug, patchedBrief, campaign);
                await upsertManifestAssetSection(slug, 'documentaryDetails', result.documentaryDetails);
                await upsertManifestAssetSection(slug, 'designedAdArtifacts', result.designedAds);
                regenerated.push(...result.documentaryDetails, ...result.designedAds);
                console.log(`[directives:apply] Regenerated ${result.documentaryDetails.length} documentary detail(s) and ${result.designedAds.length} designed ad(s)`);
            } catch (error) {
                console.error('[directives:apply] Documentary detail / designed ad generation failed:', error);
            }
        }

        const finalManifest = await getMediaManifest(slug);
        if (finalManifest) {
            const clearStale = (records: AssetRecord[]): AssetRecord[] =>
                records.map((r) =>
                    staleIds.has(r.assetId) && r.invalidatedBy === id
                        ? { ...r, invalidatedBy: undefined, invalidatedAt: undefined }
                        : r,
                );

            await saveMediaManifest({
                ...finalManifest,
                images: {
                    ...finalManifest.images,
                    hero: clearStale(finalManifest.images.hero),
                    aestheticConcepts: clearStale(finalManifest.images.aestheticConcepts),
                    sceneImages: clearStale(finalManifest.images.sceneImages),
                    documentaryDetails: clearStale(finalManifest.images.documentaryDetails ?? []),
                    designedAdArtifacts: clearStale(finalManifest.images.designedAdArtifacts ?? []),
                },
            });
        }

        await saveAestheticBrief(patchedBrief);
        await updateDirectiveStatus(slug, id, 'applied', { appliedAt: now });

        const appliedDirective = { ...directive, status: 'applied' as const, appliedAt: now };
        console.log(`[directives:apply] ${id} applied - ${regenerated.length} assets regenerated`);

        return NextResponse.json({ regenerated, directive: appliedDirective });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[directives:apply] Error applying ${id}:`, error);
        await updateDirectiveStatus(slug, id, 'failed', { failureReason: message }).catch(() => undefined);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
