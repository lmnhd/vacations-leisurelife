import { NextRequest, NextResponse } from "next/server";
import {
    renderTikTokOverlayCard,
    renderTikTokBrandLockup,
    type TikTokOverlayCardSpec,
    type TikTokBrandLockupSpec,
} from "@/lib/campaigns/media/generators/tiktok-overlay-cards";
import { generateSpeechClip } from "@/lib/campaigns/media/generators/elevenlabs-generator";
import {
    composeProductionVideo,
    composeVideoSequenceWithTransitions,
    composeVideoWithOverlayCards,
    createContainedStillVerticalClip,
} from "@/lib/campaigns/media/video-composer";
import { resolveElevenLabsVoiceForRole } from "@/lib/campaigns/media/voice-preference";
import { storeAsset } from "@/lib/campaigns/media/storage-client";

interface SequenceBeatRequest {
    backgroundImageUrl: string;
    overlaySpecs: TikTokOverlayCardSpec[];
    brandLockup?: TikTokBrandLockupSpec | null;
    spokenText?: string;
    durationSeconds?: number;
    applyFilmGrain?: boolean;
    grainStrength?: number;
}

interface PreviewRequest {
    overlaySpecs: TikTokOverlayCardSpec[];
    brandLockup?: TikTokBrandLockupSpec | null;
    backgroundImageUrl: string;
    sequenceBeats?: SequenceBeatRequest[];
    spokenText?: string;
    themeMusicUrl?: string | null;
    durationSeconds?: number;
    applyFilmGrain?: boolean;
    grainStrength?: number;
}

function buildNarrationFallbackText(overlaySpecs: TikTokOverlayCardSpec[]): string {
    return overlaySpecs
        .map((spec) => {
            if (typeof spec.spokenText === "string" && spec.spokenText.trim().length > 0) {
                return spec.spokenText.trim();
            }

            const spokenParts = spec.variant === "cta"
                ? [spec.headline]
                : [spec.headline, spec.subline];

            return spokenParts
                .filter(Boolean)
                .join(" ")
                .replace(/\bclear cta\b/ig, "");
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildSequenceNarrationText(sequenceBeats: SequenceBeatRequest[]): string {
    return sequenceBeats
        .map((beat) => {
            if (typeof beat.spokenText === "string" && beat.spokenText.trim().length > 0) {
                return beat.spokenText.trim();
            }
            return buildNarrationFallbackText(beat.overlaySpecs);
        })
        .filter(Boolean)
        .join(". ")
        .replace(/\s+/g, " ")
        .replace(/\s+\./g, ".")
        .replace(/\.\.+/g, ".")
        .trim();
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as PreviewRequest;
        const {
            overlaySpecs,
            brandLockup,
            backgroundImageUrl,
            sequenceBeats,
            spokenText,
            themeMusicUrl,
            durationSeconds,
            applyFilmGrain,
            grainStrength,
        } = body;

        const isSequenceRequest = Array.isArray(sequenceBeats) && sequenceBeats.length > 0;
        const narrationVoice = await resolveElevenLabsVoiceForRole("narration");

        let themeMusicBuffer: Buffer | null = null;
        if (themeMusicUrl) {
            const musicResponse = await fetch(themeMusicUrl);
            if (!musicResponse.ok) {
                throw new Error(`Failed to download theme music: ${musicResponse.status}`);
            }
            themeMusicBuffer = Buffer.from(await musicResponse.arrayBuffer());
        }

        if (!isSequenceRequest && (!Array.isArray(overlaySpecs) || overlaySpecs.length === 0 || !backgroundImageUrl)) {
            return NextResponse.json({ error: "Missing overlaySpecs or backgroundImageUrl" }, { status: 400 });
        }

        if (isSequenceRequest) {
            const beatBuffers: Buffer[] = [];
            const beatDurations: number[] = [];

            for (const beat of sequenceBeats) {
                if (!beat.backgroundImageUrl || !Array.isArray(beat.overlaySpecs) || beat.overlaySpecs.length === 0) {
                    return NextResponse.json({ error: "Each sequence beat needs backgroundImageUrl and overlaySpecs" }, { status: 400 });
                }

                const imageResponse = await fetch(beat.backgroundImageUrl);
                if (!imageResponse.ok) {
                    throw new Error(`Failed to download background image: ${imageResponse.status}`);
                }
                const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

                const overlayBuffers = await Promise.all(
                    beat.overlaySpecs.map(async (spec) => renderTikTokOverlayCard(spec))
                );

                const fixedBuffers = beat.brandLockup
                    ? [await renderTikTokBrandLockup(beat.brandLockup)]
                    : [];

                const clipDurationSeconds = Number.isFinite(beat.durationSeconds) && (beat.durationSeconds ?? 0) > 0
                    ? Number(beat.durationSeconds)
                    : 3;

                const stillClip = await createContainedStillVerticalClip(imageBuffer, clipDurationSeconds);
                const finalBeatVideo = await composeVideoWithOverlayCards(
                    stillClip,
                    overlayBuffers.map((buffer, index) => ({
                        buffer,
                        x: beat.overlaySpecs[index].placement.x,
                        y: beat.overlaySpecs[index].placement.y,
                    })),
                    clipDurationSeconds,
                    {
                        applyFilmGrain: beat.applyFilmGrain ?? applyFilmGrain ?? true,
                        grainStrength: beat.grainStrength ?? grainStrength ?? 6,
                        fixedOverlays: beat.brandLockup
                            ? fixedBuffers.map((buffer) => ({
                                  buffer,
                                  x: beat.brandLockup!.placement.x,
                                  y: beat.brandLockup!.placement.y,
                              }))
                            : [],
                    },
                );

                beatBuffers.push(finalBeatVideo);
                beatDurations.push(clipDurationSeconds);
            }

            const finalVideo = await composeVideoSequenceWithTransitions(beatBuffers, beatDurations);
            const narrationBuffer = await generateSpeechClip(buildSequenceNarrationText(sequenceBeats), narrationVoice.voiceId);
            const mixedVideo = await composeProductionVideo([finalVideo], narrationBuffer, themeMusicBuffer, {
                outputFormat: "9:16",
                targetDurationSeconds: 35,
                narrationVolume: 1.35,
                musicVolume: 0.12,
            });

            const assetId = `tiktok_preview_${Date.now()}`;
            const fileName = `video/preview/${assetId}.mp4`;
            const previewUrl = await storeAsset("test-playground", assetId, fileName, mixedVideo, "video/mp4");

            return NextResponse.json({ success: true, previewUrl, assetId });
        }

        const clipDurationSeconds = Number.isFinite(durationSeconds) && (durationSeconds ?? 0) > 0
            ? Number(durationSeconds)
            : 3;

        const imageResponse = await fetch(backgroundImageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download background image: ${imageResponse.status}`);
        }
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

        const overlayBuffers = await Promise.all(
            overlaySpecs.map(async (spec) => renderTikTokOverlayCard(spec))
        );

        const fixedBuffers = brandLockup
            ? [await renderTikTokBrandLockup(brandLockup)]
            : [];

        const stillClip = await createContainedStillVerticalClip(imageBuffer, clipDurationSeconds);

        const finalVideo = await composeVideoWithOverlayCards(
            stillClip,
            overlayBuffers.map((buffer, index) => ({
                buffer,
                x: overlaySpecs[index].placement.x,
                y: overlaySpecs[index].placement.y,
            })),
            clipDurationSeconds,
            {
                applyFilmGrain: applyFilmGrain ?? true,
                grainStrength: grainStrength ?? 6,
                fixedOverlays: brandLockup
                    ? fixedBuffers.map((buffer) => ({
                          buffer,
                          x: brandLockup.placement.x,
                          y: brandLockup.placement.y,
                      }))
                    : [],
            },
        );

        const assetId = `tiktok_preview_${Date.now()}`;
        const fileName = `video/preview/${assetId}.mp4`;
        const derivedNarrationText = typeof spokenText === "string"
            ? spokenText.trim()
            : buildNarrationFallbackText(overlaySpecs);
        const narrationBuffer = await generateSpeechClip(derivedNarrationText, narrationVoice.voiceId);
        const mixedVideo = await composeProductionVideo([finalVideo], narrationBuffer, themeMusicBuffer, {
            outputFormat: "9:16",
            targetDurationSeconds: clipDurationSeconds,
            narrationVolume: 1.35,
            musicVolume: 0.12,
        });
        const previewUrl = await storeAsset("test-playground", assetId, fileName, mixedVideo, "video/mp4");

        return NextResponse.json({ success: true, previewUrl, assetId });
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
