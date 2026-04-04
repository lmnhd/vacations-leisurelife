import type { ScheduledPost } from '../../schema';
import {
    loadTikTokCredentials,
    refreshTikTokAccessToken,
    isTokenNearExpiry,
} from '@/lib/integrations/tiktok-auth';

const TIKTOK_POST_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
const TIKTOK_POST_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

export type TikTokPublishLifecycleStatus =
    | 'PROCESSING_UPLOAD'
    | 'PROCESSING_DOWNLOAD'
    | 'SEND_TO_USER_INBOX'
    | 'PUBLISH_COMPLETE'
    | 'FAILED';

interface TikTokPostInfo {
    title: string;
    privacy_level: 'SELF_ONLY' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'PUBLIC_TO_EVERYONE';
    disable_duet: boolean;
    disable_comment: boolean;
    disable_stitch: boolean;
}

interface TikTokSourceInfo {
    source: 'FILE_UPLOAD';
    video_size: number;
    chunk_size: number;
    total_chunk_count: number;
}

interface TikTokInitBody {
    post_info: TikTokPostInfo;
    source_info: TikTokSourceInfo;
}

interface TikTokInitResponse {
    data?: {
        publish_id: string;
        upload_url: string;
    };
    error?: {
        code: string;
        message: string;
        log_id?: string;
    };
}

interface TikTokFetchStatusResponse {
    data?: {
        status?: TikTokPublishLifecycleStatus;
        fail_reason?: string;
        publicaly_available_post_id?: Array<string | number>;
        publicly_available_post_id?: Array<string | number>;
        uploaded_bytes?: number;
        downloaded_bytes?: number;
    };
    error?: {
        code: string;
        message: string;
        log_id?: string;
    };
}

export interface TikTokUploadResult {
    publishId: string;
    draftType: 'organic_post';
    uploadStatus: string;
    statusDetail: string;
}

export interface TikTokPublishStatusResult {
    publishId: string;
    status: TikTokPublishLifecycleStatus;
    failReason: string | null;
    publiclyAvailablePostId: string | null;
    uploadedBytes: number | null;
}

/**
 * Resolves the active TikTok access token, refreshing if near expiry.
 * Throws a provider-status error when credentials are missing or unrefreshable.
 */
async function resolveAccessToken(): Promise<string> {
    const credentials = await loadTikTokCredentials();

    if (!isTokenNearExpiry(credentials.accessTokenExpiresAt)) {
        return credentials.accessToken;
    }

    if (!credentials.refreshToken || isTokenNearExpiry(credentials.refreshTokenExpiresAt)) {
        throw new Error(
            'TikTok access token is expired and the refresh token is also expired or missing. ' +
            'Re-authorize via /api/integrations/tiktok/connect.',
        );
    }

    const refreshed = await refreshTikTokAccessToken(credentials.refreshToken);

    // Persist refreshed tokens to the durable store — no manual env edits needed
    const { upsertProviderToken } = await import('@/lib/integrations/provider-token-store');
    await upsertProviderToken('tiktok', credentials.accountLabel, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        openId: refreshed.openId,
        scope: refreshed.scope,
        accessTokenExpiresAt: new Date(refreshed.accessTokenExpiresAt),
        refreshTokenExpiresAt: new Date(refreshed.refreshTokenExpiresAt),
        lastRefreshedAt: new Date(),
    });

    console.log('[TikTok] Access token refreshed and persisted to ProviderToken store.');
    return refreshed.accessToken;
}

/**
 * Core upload function. Accepts a pre-resolved access token and asset URL so
 * it can be reused from both the dispatcher path and the distribution-marketing path.
 *
 * Creates a SELF_ONLY (private) TikTok post draft — safe for sandbox and personal-account testing.
 * Switch privacy_level to PUBLIC_TO_EVERYONE when the LLI business account is authorized.
 */
export async function uploadTikTokVideoDraft(
    accessToken: string,
    videoUrl: string,
    title: string,
): Promise<TikTokUploadResult> {
    // 1. Fetch video bytes from the stored asset URL
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video asset from ${videoUrl}: HTTP ${videoResponse.status}`);
    }
    const videoBuffer = await videoResponse.arrayBuffer();
    const videoSize = videoBuffer.byteLength;

    if (videoSize === 0) {
        throw new Error(`Video asset at ${videoUrl} is empty`);
    }

    // 2. Initialize the TikTok video upload
    const initBody: TikTokInitBody = {
        post_info: {
            title: title.slice(0, 150),
            privacy_level: 'SELF_ONLY',
            disable_duet: true,
            disable_comment: false,
            disable_stitch: true,
        },
        source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
        },
    };

    const initResponse = await fetch(TIKTOK_POST_INIT_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(initBody),
    });

    const initPayload = await initResponse.json() as TikTokInitResponse;
    const initError = initPayload.error;
    if (!initResponse.ok || (initError && initError.code !== 'ok')) {
        const detail = initError
            ? `${initError.code}: ${initError.message}`
            : `HTTP ${initResponse.status}`;
        throw new Error(`TikTok video init failed — ${detail}`);
    }

    const publishId = initPayload.data?.publish_id;
    const uploadUrl = initPayload.data?.upload_url;
    if (!publishId || !uploadUrl) {
        throw new Error('TikTok video init returned no publish_id or upload_url');
    }

    // 3. Upload the video bytes to TikTok's upload endpoint
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(videoSize),
            'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
        },
        body: videoBuffer,
    });

    if (!uploadResponse.ok) {
        throw new Error(`TikTok video upload PUT failed: HTTP ${uploadResponse.status}`);
    }

    return {
        publishId,
        draftType: 'organic_post',
        uploadStatus: 'upload_complete',
        statusDetail: `TikTok draft created. publish_id=${publishId}`,
    };
}

export async function fetchTikTokPublishStatus(
    accessToken: string,
    publishId: string,
): Promise<TikTokPublishStatusResult> {
    const response = await fetch(TIKTOK_POST_STATUS_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
    });

    const payload = await response.json() as TikTokFetchStatusResponse;
    const error = payload.error;
    if (!response.ok || (error && error.code !== 'ok')) {
        const detail = error
            ? `${error.code}: ${error.message}`
            : `HTTP ${response.status}`;
        throw new Error(`TikTok publish status fetch failed — ${detail}`);
    }

    const status = payload.data?.status;
    if (!status) {
        throw new Error(`TikTok publish status fetch returned no status for publish_id=${publishId}`);
    }

    const publicPostIds = payload.data?.publicly_available_post_id ?? payload.data?.publicaly_available_post_id ?? [];

    return {
        publishId,
        status,
        failReason: payload.data?.fail_reason ?? null,
        publiclyAvailablePostId: publicPostIds.length > 0 ? String(publicPostIds[0]) : null,
        uploadedBytes: payload.data?.uploaded_bytes ?? null,
    };
}

export async function resolveTikTokPublishStatus(
    publishId: string,
): Promise<TikTokPublishStatusResult> {
    const accessToken = await resolveAccessToken();
    return fetchTikTokPublishStatus(accessToken, publishId);
}

/**
 * Dispatcher-path entry point.
 * Resolves the asset URL from the campaign media manifest, then uploads a draft.
 */
export async function executeTikTokPost(
    campaignSlug: string,
    post: ScheduledPost,
): Promise<string> {
    console.log(`[TikTok] Initiating draft upload for campaign ${campaignSlug}, asset ${post.assetId}`);

    const { getMediaManifest } = await import('@/lib/campaigns/media/media-store');
    const manifest = await getMediaManifest(campaignSlug);
    if (!manifest) {
        throw new Error(`No media manifest found for campaign ${campaignSlug}`);
    }

    // Scan video assets from the manifest
    const videoAssets = [
        manifest.videos.tiktokSeed,
        manifest.videos.heroExplainer,
        manifest.videos.thresholdAnnouncement,
        ...manifest.videos.countdown,
        ...manifest.videos.broll,
    ].filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

    const asset = videoAssets.find((a) => a.assetId === post.assetId);
    if (!asset?.url) {
        throw new Error(
            `Asset ${post.assetId} not found in video assets for campaign ${campaignSlug}. ` +
            'Ensure the media manifest has been generated and the post references a valid video assetId.',
        );
    }

    const accessToken = await resolveAccessToken();
    const title = `${campaignSlug} — ${post.campaignStage}`;
    const result = await uploadTikTokVideoDraft(accessToken, asset.url, title);

    console.log(`[TikTok] Draft upload complete: publish_id=${result.publishId}`);
    return result.publishId;
}
