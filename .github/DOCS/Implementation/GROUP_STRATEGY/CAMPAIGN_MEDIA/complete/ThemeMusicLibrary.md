# Shared Theme Music Library — Complete Implementation

## Purpose

Adds a **default** theme music path that reuses premade tracks from a shared library while preserving the existing **Replicate MusicGen** generation path.

This solves two problems:

1. Replicate MusicGen remains available when a fresh generated track is wanted.
2. The system now has a deterministic, controllable, lower-risk fallback path for theme music using approved premade assets.

## What Was Added

### Shared Library Storage Model

A reserved shared slug is used for all premade default tracks:

```text
shared-theme-music
```

Each uploaded track is stored as a normal `theme_music` `AssetRecord` under that shared slug, which keeps the system aligned with the existing asset storage model rather than inventing a second schema.

### Shared Library Selection Logic

File:

```text
lib/campaigns/media/theme-music-library.ts
```

Responsibilities:

- list all shared default tracks
- normalize and parse tags
- score tracks against a campaign aesthetic brief
- select the best current default track for a campaign
- build the final campaign-facing `AssetRecord` when the default path is used
- produce a selection-reason string for auditability

### Media Pipeline Support

File:

```text
lib/campaigns/media/media-orchestrator.ts
```

The pipeline now accepts:

```text
themeMusicSource: 'default' | 'replicate'
```

Behavior:

- `default`
  - selects the best shared premade track
  - creates a campaign-local `theme_music` asset record referencing that track URL
- `replicate`
  - keeps the current Replicate MusicGen generation flow

### Campaign Generation API

File:

```text
app/api/groups/campaign/[slug]/media/generate/route.ts
```

The route now accepts:

```json
{
  "assetTypes": ["theme_music"],
  "themeMusicSource": "default"
}
```

or:

```json
{
  "themeMusicSource": "replicate"
}
```

### Shared Library API Endpoints

#### List / Select

```text
GET /api/groups/theme-music-library
GET /api/groups/theme-music-library?campaignSlug={slug}
```

Returns:

- all shared library tracks
- optional best current default match for a campaign slug

#### Bulk Upload

```text
POST /api/groups/theme-music-library
```

Body shape:

```json
{
  "tracks": [
    {
      "fileName": "coastal-dreams.mp3",
      "mimeType": "audio/mpeg",
      "bufferBase64": "...",
      "tags": ["ambient", "nostalgic", "instrumental"],
      "promptUsed": "warm cinematic cruise background",
      "durationSeconds": 30
    }
  ]
}
```

#### Metadata Update

```text
PATCH /api/groups/theme-music-library/{assetId}
```

Body shape:

```json
{
  "tags": ["ambient", "film", "dreamy"],
  "promptUsed": "best for analog / nostalgic campaigns",
  "durationSeconds": 30
}
```

## Test Pages

### Shared Library Manager

```text
/tests/theme-music-library
```

Capabilities:

- bulk upload multiple audio files
- set default tags for a batch
- set default notes/prompt text for a batch
- preview uploaded tracks
- edit tags per track
- edit notes per track
- edit duration metadata per track

### Existing Media Test Pages Updated

#### Per-generator test page

```text
/tests/media-generation/test
```

New behavior:

- theme music source selector
- `default` uses shared premade library
- `replicate` uses Replicate MusicGen
- resulting audio is previewable directly in the card

#### Category/full pipeline test page

```text
/tests/media-generation
```

New behavior:

- theme music source selector
- selected source is forwarded to the main generation API

## Selection Strategy

Default-library selection currently scores tracks using campaign signals derived from:

- `themeName`
- `visual.aestheticLabel`
- `visual.imageryMood`
- `visual.lightingStyle`
- `audio.musicMood`
- `messaging.toneKeywords`
- `socialConcepts.tiktokOrganic.hashtags`

The library compares those against:

- stored track tags
- stored prompt / note text

Priority:

1. exact tag matches
2. text matches in prompt / notes
3. newest track wins ties

## Why This Design

### Reused Existing Asset Infrastructure

Premade tracks are stored as ordinary `AssetRecord` items, so:

- no extra database table was required
- no parallel asset storage system was invented
- external agents can work with familiar asset metadata

### External Agent Friendly

An external agent can now:

- upload premade theme music in bulk
- update tags and notes after review
- ask for the best current default candidate for a campaign
- trigger campaign media generation with `themeMusicSource: 'default'`

### Human Controlled

The shared library creates a strong editorial control layer:

- you choose the actual music assets
- you define the tags and descriptive notes
- the AI/agent selects within your approved pool rather than inventing from scratch every time

## Key Files

```text
lib/campaigns/media/theme-music-library.ts
app/api/groups/theme-music-library/route.ts
app/api/groups/theme-music-library/[assetId]/route.ts
app/api/groups/campaign/[slug]/media/generate/route.ts
app/api/groups/campaign/[slug]/media/test/audio/route.ts
app/(tests)/tests/theme-music-library/page.tsx
app/(tests)/tests/media-generation/page.tsx
app/(tests)/tests/media-generation/test/page.tsx
lib/campaigns/media/media-orchestrator.ts
```

## Operational Notes

- `REPLICATE_API_TOKEN` is only needed when using the `replicate` path
- R2 credentials are needed for shared library uploads and for normal uploaded media assets
- Shared library tracks remain reusable across all campaigns because they live under the shared reserved slug

## Recommended Validation Order

1. Open `/tests/theme-music-library`
2. Bulk upload a few premade `.mp3` tracks
3. Add distinct tags per track
4. Open `/tests/media-generation/test`
5. Set theme music source to `default`
6. Run the theme music card for a campaign with an approved brief
7. Confirm the selected track and preview look correct
8. Compare with `replicate` mode only when needed

## Outcome

The system now supports both:

- **Replicate-generated theme music**
- **Shared default premade theme music**

without breaking the existing media pipeline or the external-agent contract.
