import { NextRequest, NextResponse } from "next/server";
import { renderTikTokOverlayCard } from "@/lib/campaigns/media/generators/tiktok-overlay-cards";
import { composeVideoWithOverlayCards, createContainedStillVerticalClip } from "@/lib/campaigns/media/video-composer";
import { storeAsset } from "@/lib/campaigns/media/storage-client";

interface OverlayCardSpec {
    badge: string;
    headline: string;
    subline: string;
    accentColor: string;
    placement: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

interface PreviewRequest {
    overlaySpec?: OverlayCardSpec;
    overlaySpecs?: OverlayCardSpec[];
    backgroundImageUrl: string;
}

const SANDBOX_DESIGN_WIDTH = 1920;
const SANDBOX_DESIGN_HEIGHT = 1920;
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;

function scaleSandboxPlacement(placement: OverlayCardSpec["placement"]): OverlayCardSpec["placement"] {
    const scaleX = VIDEO_WIDTH / SANDBOX_DESIGN_WIDTH;
    const scaleY = VIDEO_HEIGHT / SANDBOX_DESIGN_HEIGHT;

    return {
        x: Math.round(placement.x * scaleX),
        y: Math.round(placement.y * scaleY),
        width: Math.round(placement.width * scaleX),
        height: Math.round(placement.height * scaleY),
    };
}

export async function POST(request: NextRequest) {
    try {
        const body: PreviewRequest = await request.json();
        const { overlaySpec, overlaySpecs, backgroundImageUrl } = body;
        const resolvedOverlaySpecs = Array.isArray(overlaySpecs) && overlaySpecs.length > 0
            ? overlaySpecs
            : overlaySpec
                ? [overlaySpec]
                : [];

        if (resolvedOverlaySpecs.length === 0 || !backgroundImageUrl) {
            return NextResponse.json({ error: "Missing overlaySpec/overlaySpecs or backgroundImageUrl" }, { status: 400 });
        }

        // Download background image
        const imageResponse = await fetch(backgroundImageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download background image: ${imageResponse.status}`);
        }
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

        const overlayBuffers = await Promise.all(
            resolvedOverlaySpecs.map(async (spec) => renderTikTokOverlayCard({
                badge: spec.badge,
                headline: spec.headline,
                subline: spec.subline,
                accentColor: spec.accentColor,
                placement: scaleSandboxPlacement(spec.placement),
            }))
        );

        // Create a short still clip (3 seconds for preview)
        const stillClip = await createContainedStillVerticalClip(imageBuffer, 3);

        // Compose with overlay
        const finalVideo = await composeVideoWithOverlayCards(
            stillClip,
            overlayBuffers.map((buffer, index) => {
                const placement = scaleSandboxPlacement(resolvedOverlaySpecs[index].placement);
                return {
                    buffer,
                    x: placement.x,
                    y: placement.y,
                };
            }),
            3
        );

        // Store the preview video
        const assetId = `tiktok_preview_${Date.now()}`;
        const fileName = `video/preview/${assetId}.mp4`;
        const previewUrl = await storeAsset("test-playground", assetId, fileName, finalVideo, "video/mp4");

        return NextResponse.json({
            success: true,
            previewUrl,
            assetId,
        });

    } catch (error) {
        console.error("TikTok playground preview error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Unknown error occurred",
            },
            { status: 500 }
        );
    }
}
