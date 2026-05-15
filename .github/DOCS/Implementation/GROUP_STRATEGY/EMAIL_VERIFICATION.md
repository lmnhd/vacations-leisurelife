# Email Verification for Waitlist Anti-Abuse

## Problem
The waitlist form at `/groups/{slug}` accepted any email address and immediately counted it toward the 8-cabin threshold. One person with 8 burner emails could prematurely trigger `THRESHOLD_MET`, firing broadcast emails/SMS and exposing booking links.

## Solution
Entries are now created with `emailVerified: false`. Only entries that have been verified via a click-through link in the confirmation email count toward the threshold.

## How It Works

```
Guest submits form → Entry created (emailVerified=false)
  → Confirmation email sent (includes verification link)
  → Guest clicks link → GET /api/groups/campaign/{slug}/verify?email=...&token=...
  → emailVerified flipped to true, token cleared (single-use)
  → If verified count ≥ 8 → campaign auto-promotes to THRESHOLD_MET
  → Guest redirected to /groups/{slug}?verified=1 (success banner shown)
```

## Files Changed

| File | Change |
|------|--------|
| `lib/campaigns/types.ts` | Added `emailVerified`, `verificationToken` to `CampaignWaitlistEntry`; added `email_verified` to `LeadEventType` |
| `lib/campaigns/waitlist-store.ts` | HMAC token generation on upsert; `verifyWaitlistEmail()` and `getVerifiedWaitlistSummary()` |
| `app/api/groups/campaign/[slug]/waitlist/route.ts` | Removed auto-promotion at signup; uses `getVerifiedWaitlistSummary` for threshold percent |
| `app/api/groups/campaign/[slug]/verify/route.ts` | **New** — verification endpoint, handles promotion check post-verification |
| `lib/campaigns/landing/view-model.ts` | Progress bar uses verified summary for threshold percent |
| `components/campaign-landing/guest-portal.tsx` | Accepts `emailJustVerified`/`emailVerifyError` props; shows success/error banners |
| `components/campaign-landing/waitlist-form.tsx` | Shows "Check your inbox" notice after signup when `emailVerified=false` |
| `app/(landing)/groups/[slug]/page.tsx` | Passes `verified`/`verify_error` query params to `GuestPortal` |

## Verification Token Design
- HMAC-SHA256 with a random nonce stored on the entry
- Token is tied to `slug:email` — cannot be reused across entries
- Token is cleared after successful verification (single-use)
- Re-submitting the form regenerates a new token (unless already verified)

## Backwards Compatibility
- Existing entries will have `emailVerified: undefined` (falsy) — they won't count toward threshold until they re-verify
- `getVerifiedWaitlistSummary` filters on `emailVerified === true` explicitly
- `getCampaignWaitlistSummary` (total count) is still used for display purposes

## Remaining Klaviyo Integration
The verification link URL needs to be included in the `waitlist_confirmation` Klaviyo email template. The URL pattern is:

```
{BASE_URL}/api/groups/campaign/{slug}/verify?email={email}&token={verificationToken}
```

The `verificationToken` is returned in the waitlist POST response and should be passed to the Klaviyo event builder so it appears in the email template variables.
