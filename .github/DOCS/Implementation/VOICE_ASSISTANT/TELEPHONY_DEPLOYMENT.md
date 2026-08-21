# Telephony Deployment - Manual Steps (Twilio, OpenAI, Render, Google Voice)

**Created:** August 13, 2026
**Status:** The telephone control service, OpenAI webhook, Twilio SIP route, and
initial live call have been deployed. The Odysseus worker and the new Vercel
variables below still require deployment after this reliability update.

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

Vercel tool policy/cache
  -> Render Odysseus worker /internal/odysseus-search
  -> one serialized persistent Playwright session
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
   `"status":"ok"`. The OpenAI key, webhook secret, app URL, and telephony
   token flags must be `true`; `transferConfigured` may remain `false` if
   human transfer is intentionally disabled.

### 1A. Deploy the Render Odysseus worker

Create a second Render Web Service from the same repository:

- Runtime: Docker
- Dockerfile: `services/odysseus-worker/Dockerfile`
- Docker context: repository root
- Health check: `/healthz`
- Definition: `services/odysseus-worker/render.yaml`

The Docker image is pinned to the same Playwright version as the workspace and
includes Chromium plus its Linux runtime dependencies. Do not replace this
with a native Node build unless those system dependencies are installed too.

Set these worker variables:

| Variable | Value |
| --- | --- |
| `ODYSSEUS_WORKER_TOKEN` | A new long random secret, different from the telephony token. |
| `CB_EMAIL` / `CB_PASSWORD` | Cruise Brothers Agent Tools credentials. |
| `ODYSSEUS_CHROME_EXECUTABLE_PATH` | Leave unset to use Playwright Chromium on Render. |

Set these variables in Vercel Production and redeploy:

| Variable | Value |
| --- | --- |
| `VOICE_CONVERSATION_STORE` | `dynamodb` |
| `VOICE_CONVERSATION_TABLE` | `lll-shadow-campaigns` |
| `NEXT_PUBLIC_VOICE_ASSISTANT_PHONE` | `+18557995436` for the first-load phone option. |
| `ODYSSEUS_WORKER_URL` | The worker's Render base URL, without a trailing slash. |
| `ODYSSEUS_WORKER_TOKEN` | Exactly the same worker secret used on Render. |

The existing Vercel AWS credentials must permit `GetItem`, `PutItem`,
`UpdateItem`, `DeleteItem`, and `Query` on `lll-shadow-campaigns`. Enable
DynamoDB TTL on the `ttl` attribute when convenient; application reads also
reject expired conversation records, so TTL deletion timing is not trusted for
authorization.

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
| Some tool calls return `conversation_not_found` | Vercel is missing `VOICE_CONVERSATION_STORE=dynamodb`, its AWS permissions are incomplete, or the conversation expired after 45 minutes. |
| Live search returns `odysseus_worker_not_configured` | `ODYSSEUS_WORKER_URL` or its shared worker token is missing in Vercel. |
| Realtime reports an active-response error after tools | Check for a current deployment: tool outputs must be batched and followed by exactly one `response.create`. |

---

## Cost and safety controls already in code

- `MAX_CALL_SECONDS` hard ceiling with a spoken wrap-up before hangup.
- `MAX_CONCURRENT_CALLS` with a correct SIP 486 rejection.
- Per-conversation tool budget (40 calls) enforced in the shared runtime.
- Shared DynamoDB conversation state and one-hour sanitized trace retention.
- Identical concurrent tool calls are coalesced; one result is returned for
  each original Realtime `call_id`, followed by one model response request.
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
