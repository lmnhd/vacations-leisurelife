import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief, getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getMediaManifest, saveMediaManifest } from '@/lib/campaigns/media/media-store';
import { saveDirective, listDirectives, getDirective } from '@/lib/campaigns/directive-store';
import { resolveDirective, inferScopeFromPatch } from '@/lib/campaigns/directive-agent';
import { collectStaleAssetIds } from '@/lib/campaigns/directive-patch';
import type { CampaignDirective, AssetRecord } from '@/lib/campaigns/schema';

// ─── GET /api/groups/campaign/[slug]/directives ───────────────────────────────
// Lists all directives for a campaign.

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const directives = await listDirectives(slug);
        return NextResponse.json({ directives });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ─── POST /api/groups/campaign/[slug]/directives ──────────────────────────────
// Creates and resolves a directive. Marks affected assets stale. Does NOT
// regenerate — call POST /directives/[id]/apply to trigger regeneration.
//
// Body: { text: string }
// Response: { directive: CampaignDirective, affectedCount: number }

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;

        const body = await req.json() as { text?: unknown };
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
            return NextResponse.json({ error: 'Request body must include a non-empty "text" field' }, { status: 400 });
        }

        const [brief, campaign] = await Promise.all([
            getAestheticBrief(slug),
            getCampaignBlueprint(slug),
        ]);

        if (!brief) {
            return NextResponse.json({ error: `No brief found for campaign: ${slug}` }, { status: 404 });
        }
        if (!campaign) {
            return NextResponse.json({ error: `Campaign not found: ${slug}` }, { status: 404 });
        }

        console.log(`[directives] Resolving directive for ${slug}: "${text.slice(0, 80)}..."`);
        const patch = await resolveDirective(text, brief);
        const scope = inferScopeFromPatch(patch);

        // If the patch is empty, the directive had no actionable effect
        if (scope.length === 0) {
            return NextResponse.json(
                { error: 'Directive did not resolve to any actionable field changes. Try being more specific.' },
                { status: 422 },
            );
        }

        // Mark affected assets stale in the manifest
        const manifest = await getMediaManifest(slug);
        const affectedAssetIds: string[] = [];

        if (manifest) {
            const directiveId = `dir_${randomUUID().slice(0, 8)}`;
            const now = new Date().toISOString();
            const staleIds = collectStaleAssetIds(manifest, scope);

            const markStale = (records: AssetRecord[]): AssetRecord[] =>
                records.map((r) =>
                    staleIds.includes(r.assetId)
                        ? { ...r, invalidatedBy: directiveId, invalidatedAt: now }
                        : r,
                );

            const updatedManifest = {
                ...manifest,
                images: {
                    ...manifest.images,
                    hero: markStale(manifest.images.hero),
                    aestheticConcepts: markStale(manifest.images.aestheticConcepts),
                    sceneImages: markStale(manifest.images.sceneImages),
                    documentaryDetails: markStale(manifest.images.documentaryDetails ?? []),
                    designedAdArtifacts: markStale(manifest.images.designedAdArtifacts ?? []),
                },
            };

            await saveMediaManifest(updatedManifest);
            affectedAssetIds.push(...staleIds);

            const directive: CampaignDirective = {
                id: directiveId,
                slug,
                text,
                scope,
                patch,
                status: 'pending',
                affectedAssetIds,
                createdAt: now,
            };

            await saveDirective(directive);

            console.log(`[directives] Created ${directiveId} for ${slug} — ${affectedAssetIds.length} assets stale`);
            return NextResponse.json({ directive, affectedCount: affectedAssetIds.length });
        }

        // No manifest yet — save directive without asset marking
        const directiveId = `dir_${randomUUID().slice(0, 8)}`;
        const directive: CampaignDirective = {
            id: directiveId,
            slug,
            text,
            scope,
            patch,
            status: 'pending',
            affectedAssetIds: [],
            createdAt: new Date().toISOString(),
        };

        await saveDirective(directive);
        return NextResponse.json({ directive, affectedCount: 0 });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[directives] POST error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
