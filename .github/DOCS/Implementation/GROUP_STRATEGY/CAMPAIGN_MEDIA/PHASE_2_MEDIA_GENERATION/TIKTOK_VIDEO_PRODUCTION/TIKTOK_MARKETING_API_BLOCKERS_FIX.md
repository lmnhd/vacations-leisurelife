# TikTok Marketing API Blockers — Fix Instructions

## Status
The two original blockers in `lib/campaigns/distribution/platforms/tiktok-paid.ts` are now implemented and verified locally:

1. `leadgen/form/create/` now returns a real `form_id`.
2. The paid draft flow resolves `post.assetId` to an `AssetRecord`, validates it as a video asset, uploads `assetRecord.url` through `file/video/ad/upload/`, and uses the returned native `video_id` in `ad/create/`.

This document now serves as the implementation record and verification reference for the paid TikTok path.

---

## Blocker 1: Stubbed Lead Form Creation

### Location
`lib/campaigns/distribution/platforms/tiktok-paid.ts` lines 172–194

### Current State
```typescript
export async function createTikTokLeadForm(
    campaignSlug: string,
    campaignLandingUrl: string,
): Promise<string> {
    // ... credential checks ...
    console.warn("[TikTok-Paid] Lead form creation via API is currently unsupported in v1.3. Returning placeholder.");
    const formData = { form_id: "pending_manual_form_creation" };
    return formData.form_id;
}
```

This returns a placeholder string. TikTok lead-gen ads **require** a real `form_id`. Without it, the ad will fail at creation time or will not collect leads.

### Required Fix
Implement the Marketing API `leadgen/form/create/` endpoint.

#### API Reference
- **Endpoint**: `POST /open_api/v1.3/leadgen/form/create/`
- **Docs**: https://business-api.tiktok.com/open_api/v1.3/leadgen/form/create/

#### Request Body (minimal viable payload)
```json
{
  "advertiser_id": "<advertiserAccountId>",
  "form_name": "LLI-<campaignSlug>-lead-form",
  "form_type": "INSTANT_FORM",
  "locale": "en_US",
  "thank_you_page": {
    "type": "WEBSITE",
    "website_url": "<campaignLandingUrl>"
  },
  "questions": [
    {
      "question_type": "CUSTOM",
      "title": "First Name",
      "is_required": true
    },
    {
      "question_type": "CUSTOM",
      "title": "Email",
      "is_required": true
    },
    {
      "question_type": "CUSTOM",
      "title": "Phone Number",
      "is_required": true
    }
  ]
}
```

> **Note**: The `thank_you_page.website_url` must be a valid HTTPS URL. Use `campaignLandingUrl` which is already passed into this function.

#### Response Shape
```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "form_id": "<native_form_id>"
  }
}
```

#### Implementation Steps
1. Reuse the existing `postMarketingApi<TData>` helper (lines 36–57) or add a typed wrapper `postMarketingApi<TikTokLeadFormCreateData>`.
2. Build the request body using the advertiser ID, campaign slug (for naming), and the landing URL.
3. Return the real `form_id` from `data.form_id`.
4. Remove the `console.warn` placeholder.
5. Handle API errors gracefully — if `code !== 0`, throw with the error message so upstream `dispatchTikTokPaidLive` surfaces it correctly.

---

## Blocker 2: Missing Video Upload Step Before Ad Creation

### Location
`lib/campaigns/distribution/platforms/tiktok-paid.ts` lines 132–140 (inside `createTikTokPaidLeadGenDraft`)

### Current State
```typescript
const adBody: Record<string, unknown> = {
    advertiser_id: advertiserAccountId,
    adgroup_id: adGroupData.adgroup_id,
    ad_name: `LLI-${contract.campaignSlug}-ad`,
    ad_format: 'SINGLE_VIDEO',
    video_id: contract.adAssetId,
    operation_status: 'DISABLE',
};
```

`contract.adAssetId` is an **internal asset ID** (e.g., a UUID referencing an `AssetRecord` in the media store). The Marketing API `ad/create/` endpoint expects a **native TikTok `video_id`** — a string returned by TikTok's video upload endpoint after the file has been ingested into TikTok's Creative Center.

Passing an internal asset ID here will fail with a video-not-found or invalid-parameter error.

### Required Fix
Upload the video file to TikTok via the Marketing API **before** calling `ad/create/`, then use the returned `video_id` in the ad body.

#### Data Flow
`post.assetId` (in `dispatchTikTokPaidLive`) → maps to an `AssetRecord` which contains:
- `url` — the actual video file URL (publicly accessible)
- `mimeType` — e.g. `video/mp4`
- `fileSizeBytes`

You must resolve the asset record, download/fetch the video bytes, and upload them to TikTok.

#### API Reference — Video Upload
TikTok Marketing API supports two upload paths:

**Option A: URL-based upload (preferred, simpler)**
- **Endpoint**: `POST /open_api/v1.3/file/video/ad/upload/`
- **Docs**: https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/

**Request Body**:
```json
{
  "advertiser_id": "<advertiserAccountId>",
  "video_url": "<publicly_accessible_video_url>",
  "display_name": "LLI-<campaignSlug>-creative",
  "allow_download": false,
  "is_shareable": false
}
```

**Response**:
```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "video_id": "<native_tiktok_video_id>",
    "width": 1080,
    "height": 1920,
    "duration": 15.0,
    "material_id": "<material_id>"
  }
}
```

**Option B: Byte-based upload (multipart)**
- **Endpoint**: `POST /open_api/v1.3/file/video/ad/upload/` with `upload_type: UPLOAD_BY_FILE`
- Use this only if the video URL is not publicly accessible or if TikTok rejects URL-based upload.

#### Implementation Steps
1. **Inside `createTikTokPaidLeadGenDraft`**, before the ad creation block (line 132):
   - Add a new helper function `uploadTikTokVideo` or inline the upload logic.
   - The function must resolve the internal `adAssetId` to an actual video URL.
   - Call `POST /file/video/ad/upload/` with `video_url` set to the resolved public URL.
   - Extract `video_id` from the response.

2. **Replace line 138**:
   - Change `video_id: contract.adAssetId` → `video_id: <uploaded_video_id>`.

3. **Error handling**:
   - If upload fails, throw with the TikTok error message.
   - The upstream `dispatchTikTokPaidLive` will catch this and mark the post as `error`.

#### Asset Resolution Note
The `AssetRecord` schema (in `lib/campaigns/schema.ts` lines 1043–1062) stores:
- `assetId` — the UUID string
- `url` — the actual file location
- `mimeType` — should be `video/mp4` for TikTok ads

You may need to import the asset store or manifest lookup to resolve `assetId` → `url`. Check `lib/campaigns/media/media-store.ts` or similar for existing asset lookup utilities.

---

## Testing & Validation

After both fixes are implemented:

1. **Restart the dev server** (or reload env).
2. Trigger a TikTok paid dispatch via `/tests/distribution` or the campaign distribution API.
3. Verify the API call sequence:
   - `campaign/create/` → returns campaign_id
   - `leadgen/form/create/` → returns real form_id (not placeholder)
   - `file/video/ad/upload/` → returns video_id
   - `adgroup/create/` → returns adgroup_id
   - `ad/create/` → returns ad_id
4. Check the TikTok Ads Manager UI — the paused campaign, ad group, and ad should appear with the uploaded video attached.

---

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `lib/campaigns/distribution/platforms/tiktok-paid.ts` | 172–194 | Replace stub with real `leadgen/form/create/` call |
| `lib/campaigns/distribution/platforms/tiktok-paid.ts` | 132–140 | Add video upload step; use native `video_id` in ad body |

## Prerequisites Already Met
- `TIKTOK_MARKETING_ACCESS_TOKEN` ✅
- `TIKTOK_ADVERTISER_ID` ✅
- `TIKTOK_MARKETING_API_APP_ID` ✅
- `TIKTOK_MARKETING_API_SECRET` ✅
