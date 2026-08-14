# Telephony Deployment - Manual Steps (Twilio, OpenAI, Render, Google Voice)

**Created:** August 13, 2026
**Status:** Nothing in this document has been executed. Every step below changes
an external, billable account and requires Nathaniel to perform it personally.
Agents implemented the code and the configuration definition only.

Architecture reference: `VOICE_ASSISTANT_CANONICAL_PLAN.md` section 2.3.
Service code: `services/voice-telephony/`.

```text
Caller
  -> (optional) Google Voice auto attendant
  -> Twilio voice number
  -> Twilio Elastic SIP Trunk
  -> OpenAI Realtime SIP (sip:$PROJECT_ID@sip.api.openai.com;transport=tls)

OpenAI realtime.call.incoming webhook
  -> Render service /webhooks/openai   (signature verified, deduplicated)
  -> POST {APP_URL}/api/conversation/telephone-launch   (shared agent config)
  -> accept or reject the call
  -> sideband WebSocket wss://api.openai.com/v1/realtime?call_id=...
       tools, safety interventions, transfer (refer), hangup
```

The Render service never carries call audio. OpenAI Realtime SIP handles the
media; this process exchanges control events only, and no call audio is
recorded at any point.

---

## Order of operations

Do these in order. Each step is verifiable on its own, so a failure is easy to
localize.

### 1. Deploy the Render control service

1. In Render, create a **Web Service** from this repository.
   - Root directory: `services/voice-telephony`
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Health check path: `/healthz`
   - The definition is committed at `services/voice-telephony/render.yaml`;
     you may import it as a Blueprint instead of filling the form manually.
2. Set environment variables (all `sync: false` values are secrets):

   | Variable | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | Standard project API key. Server-side only. |
   | `OPENAI_WEBHOOK_SECRET` | From step 2 below. Set it after creating the webhook. |
   | `LEISURE_LIFE_APP_URL` | `https://<your-vercel-domain>` (no trailing slash) |
   | `TELEPHONY_SERVICE_TOKEN` | A long random string. Must match the same variable in Vercel. |
   | `HUMAN_TRANSFER_NUMBER` | E.164 destination, e.g. `+14015551234`. Leave unset to disable transfer. |
   | `BUSINESS_HOURS_START` / `BUSINESS_HOURS_END` | Local hours, 24h clock. Defaults 9 / 20. |
   | `BUSINESS_TIMEZONE` | e.g. `America/New_York` |
   | `MAX_CALL_SECONDS` | Hard call ceiling. Default 900. |
   | `MAX_CONCURRENT_CALLS` | Default 4. Calls beyond this get SIP 486 Busy. |

3. Add `TELEPHONY_SERVICE_TOKEN` to the Vercel project with the identical
   value. Without a match, `/api/conversation/telephone-launch` returns 401 and
   every call is rejected with SIP 503 (which is the correct fail-closed
   behavior, not a bug).
4. Verify: `curl https://<render-service>/healthz` should report
   `"status":"ok"` and show each `configured` flag as `true`.

### 2. Create the OpenAI webhook

1. OpenAI platform -> your project -> **Webhooks** -> create endpoint.
2. URL: `https://<render-service>/webhooks/openai`
3. Subscribe to the `realtime.call.incoming` event.
4. Copy the signing secret (it begins with `whsec_`) into Render as
   `OPENAI_WEBHOOK_SECRET`, then redeploy so the value is live.
5. Note your **project id** (`proj_...`); the SIP trunk needs it in step 3.

Verification: send a test delivery from the OpenAI dashboard. The Render logs
should show `webhook.duplicate_ignored` on a repeated delivery and
`webhook.rejected` with `signature_mismatch` if you deliberately corrupt the
secret. An unsigned request must return 401.

### 3. Buy a Twilio number and configure Elastic SIP Trunking

1. Twilio Console -> **Phone Numbers** -> buy a voice-capable number.
2. **Elastic SIP Trunking** -> Trunks -> create a trunk (e.g. `leisure-life-ai`).
3. In the trunk's **Origination** settings, add an Origination URI:
   ```
   sip:<YOUR_OPENAI_PROJECT_ID>@sip.api.openai.com;transport=tls
   ```
   Use `sip-eu.api.openai.com` only if your OpenAI project is in the EU region.
4. Under the trunk's **Numbers**, associate the number you purchased.
5. Confirm the trunk uses TLS and that secure media (SRTP) is enabled if your
   Twilio account offers it.

Verification: call the Twilio number. Twilio's trunk logs should show the call
routed to OpenAI, and Render should log `call.admitted`, `call.accepted`,
`sideband.connected`, then `call.opening_requested`. The AI disclosure and
opening question should begin without waiting for the caller to speak.

### 4. Configure the human transfer destination

Transfer is deliberately conservative:

- With `HUMAN_TRANSFER_NUMBER` unset, the transfer tool reports failure and the
  agent honestly offers a callback instead. This is the safe default.
- Outside `BUSINESS_HOURS_START`-`BUSINESS_HOURS_END`, transfer is unavailable
  and the agent says so rather than dialing an unattended line.
- The agent may only say a transfer is happening after the OpenAI refer API
  accepts the request. It never claims the caller reached a person.

Set `HUMAN_TRANSFER_NUMBER` only to a number a person actually answers during
the configured hours.

### 5. Optional - Google Voice auto attendant front door

Ordinary Google Voice linked-number forwarding does not support forwarding to
an automated system. Google Voice **Standard or Premier** does support auto
attendants, and an auto attendant may transfer a caller to another phone
number.

1. Confirm the Workspace subscription tier includes auto attendants
   (Standard or Premier) and that you have Voice admin access.
2. Google Admin -> Voice -> **Auto attendants** -> create one for the existing
   business number.
3. Add a menu option ("press 1 to speak with our AI cruise concierge") or an
   after-hours route whose action is **transfer to a phone number**, targeting
   the Twilio number from step 3.
4. Test thoroughly before publishing: caller ID passthrough, added latency
   from the extra hop, voicemail loops, business-hours routing, transfer
   behavior, and per-minute cost.

Do **not** port the public number to Twilio during this build. Porting is a
separate business decision with service-continuity consequences.

---

## What each failure looks like

| Symptom | Likely cause |
| --- | --- |
| Call connects then drops immediately | `LEISURE_LIFE_APP_URL` wrong or `TELEPHONY_SERVICE_TOKEN` mismatched; look for `call.configuration_unavailable` |
| Every webhook returns 401 | `OPENAI_WEBHOOK_SECRET` missing or stale after a redeploy |
| Caller hears silence | Trunk Origination URI wrong, or project id incorrect in the SIP URI |
| Call is accepted but waits for the caller to speak | Render is missing the explicit sideband `response.create`; verify `call.opening_requested` appears after `sideband.connected` |
| Busy signal | `MAX_CONCURRENT_CALLS` reached; Render logs show `call.rejected` with `at_concurrent_call_capacity` |
| Agent refuses to transfer | `HUMAN_TRANSFER_NUMBER` unset or outside business hours; this is intended behavior |
| Calls drop during a deploy | Expected: Render recycles instances. The service says a wrap-up line and hangs up gracefully (`service.shutdown_started`). |

---

## Cost and safety controls already in code

- `MAX_CALL_SECONDS` hard ceiling with a spoken wrap-up before hangup.
- `MAX_CONCURRENT_CALLS` with a correct SIP 486 rejection.
- Per-conversation tool budget (40 calls) enforced in the shared runtime.
- No call recording, ever.
- Emergency language triggers an immediate "hang up and dial 911" response.
- Caller ID never authenticates: private booking drafts require an approved
  short-lived call-intent correlation created in an authorized web session.

## Still to build before a public phone launch

These are known gaps, deliberately not faked:

1. **Call-intent correlation storage.** `admitCall` accepts a correlation
   record and the policy is tested, but the issue/consume store and the spoken
   or DTMF code capture are not yet wired. Until then every call is the
   anonymous concierge, which is the safe default.
2. **Secure web continuation delivery.** The agent can describe it; sending the
   SMS/email link requires connecting the existing Booking Assistant resume
   token flow to the telephony path.
3. **Load testing** against real Twilio concurrency before publishing a number.
