# Phase 4 Next Steps

## Immediate Priority

Finish TikTok in Sandbox before spending more time on Production review or Meta recovery.

## Next Operator Actions

1. switch the TikTok app from `Production` to `Sandbox`
2. create a Sandbox for the existing app
3. configure Login Kit Web redirect URIs in Sandbox
4. add both of these redirect URIs if TikTok allows both:
   - `https://leisurelifevacations.net/api/integrations/tiktok/callback`
   - `https://www.leisurelifevacations.net/api/integrations/tiktok/callback`
5. add the intended TikTok publishing account as a Sandbox target user
6. retry the deployed auth flow from `/api/integrations/tiktok/connect`

## Next App Tasks

1. confirm which callback domain TikTok actually accepts in Sandbox
2. persist TikTok token values securely after successful callback
3. add refresh-token support
4. replace the TikTok placeholder adapter with a real `FILE_UPLOAD` implementation
5. write the returned TikTok publish metadata into the distribution record

## Next UI Tasks

1. replace `Dispatch Ads` naming with lifecycle-accurate labels
2. add a `Validate Provider Connections` action
3. show provider readiness state for TikTok and Meta in the review UI
4. show native IDs and review metadata once live draft creation succeeds

## Deferred Until After TikTok Sandbox Works

1. TikTok Production review submission and demo-video packaging
2. Meta business verification recovery work
3. Google Ads adapter implementation

## Success Checkpoint

The next meaningful checkpoint is not "TikTok app saved in Production." The next meaningful checkpoint is:

1. TikTok Sandbox authorizes successfully
2. the callback exchanges a real code for tokens
3. one campaign seed video reaches TikTok as a real draft upload