# Phase 4 Next Steps

## Immediate Priority

Realign TikTok Phase 4 with the master campaign strategy: preserve the existing organic adapter, but move the next implementation pass to TikTok paid acquisition and lead ingestion.

## Next Operator Actions

1. confirm the correct TikTok advertiser / business account is the one that should own paid campaign creation
2. confirm access to TikTok Ads / Marketing API and lead generation capabilities
3. identify the advertiser IDs, app credentials, and webhook requirements needed for lead-gen integration
4. keep the existing publishing-account OAuth setup only for the supporting organic adapter

## Next App Tasks

1. define a TikTok paid lead-gen contract that maps campaign slug, creative asset, targeting preset, and native lead form into one request shape
2. create paused TikTok paid drafts and persist native IDs plus review metadata
3. ingest TikTok lead submissions into the existing DynamoDB waitlist contract
4. expose advertiser readiness separately from organic-publishing readiness in provider status
5. keep the organic adapter intact, but relabel it as supporting validation rather than the main acquisition engine

## Next UI Tasks

1. show separate TikTok sections for `Paid Acquisition` and `Organic Proofing`
2. add advertiser-connection validation in the review UI
3. show native paid IDs, form IDs, and activation state once paused drafts are created
4. keep organic-status reporting visible, but secondary

## Deferred Until After The Local TikTok Path Is Autonomous

1. direct website-click TikTok traffic campaigns beyond native lead-gen
2. `video.publish` direct-post hardening for the supporting organic adapter
3. Meta business verification recovery work
4. Google Ads adapter implementation

## Success Checkpoint

The next meaningful checkpoint is not another organic TikTok milestone. The next meaningful checkpoint is:

1. the app can validate TikTok advertiser readiness for paid acquisition
2. one campaign can create paused TikTok lead-gen drafts with native IDs persisted
3. TikTok lead submissions can enter the existing DynamoDB waitlist and nurture path cleanly
4. the organic adapter remains available as a supporting proof signal without steering the acquisition architecture