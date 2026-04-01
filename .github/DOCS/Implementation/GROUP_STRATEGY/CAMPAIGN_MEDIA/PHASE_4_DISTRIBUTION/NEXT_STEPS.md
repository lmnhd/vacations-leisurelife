# Phase 4 Next Steps

## Immediate Priority

Close the TikTok autonomy gap with a durable token store and run the first real local draft-upload test using the successful business-account authorization.

## Next Operator Actions

1. place the successful Leisure Life Interactive business-account TikTok token set into the chosen bootstrap env source
2. set `TIKTOK_ACCOUNT_LABEL=business`
3. set the access-token and refresh-token expiry timestamps from the callback success page
4. keep the redirect URI pinned to `https://leisurelifevacations.net/api/integrations/tiktok/callback` unless the auth endpoint is intentionally moved

## Next App Tasks

1. add a durable local-first TikTok token store instead of relying on static env vars as the long-term source of truth
2. persist refreshed TikTok token values automatically
3. load TikTok provider credentials from the durable store during local dispatch
4. run one real local `FILE_UPLOAD` TikTok draft-upload test
5. write the returned TikTok publish metadata into the distribution record

## Next UI Tasks

1. replace `Dispatch Ads` naming with lifecycle-accurate labels
2. add a `Validate Provider Connections` action
3. show provider readiness state for TikTok and Meta in the review UI
4. show native IDs and review metadata once live draft creation succeeds

## Deferred Until After The Local TikTok Path Is Autonomous

1. TikTok Production review submission and demo-video packaging
2. Meta business verification recovery work
3. Google Ads adapter implementation
4. callback-hosting simplification or tunnel-based local OAuth bootstrap improvements

## Success Checkpoint

The next meaningful checkpoint is not "business account auth succeeded." The next meaningful checkpoint is:

1. the business-account token set is available to the local environment
2. the app refreshes TikTok tokens without manual env edits
3. one campaign seed video reaches TikTok as a real draft upload from the local environment
4. the local process can be restarted without losing TikTok dispatch capability