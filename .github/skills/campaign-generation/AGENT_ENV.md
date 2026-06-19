# Agent Execution Environment

Execution constraints and reliable patterns for agents. **Read this before running any script or making any API call.**

**Back to [SKILL.md](./SKILL.md)**

---

## 1c. Agent Execution Environment â€” Constraints & Reliable Patterns

Four repeated failures block autonomous agent operation in this project. This section documents each failure, its root cause, and the approved mitigation pattern.

### Script Execution Safety Classification

Before running any script, classify it using this table:

| Class | Scripts | Rule |
|---|---|---|
| **Playwright-dependent** | `run-phase-b.ts`, `scrape-cb-deals.ts`, `cb-inventory-scraper.ts`, `lib/campaigns/booking-link-validator.ts`, `test-package-link.ts`, `odysseus-booking-flow.ts`, all `scrape-*.ts` | **Allowed autonomously for non-booking work** â€” agents may use these for CB/Odysseus inventory checks, pricing validation, and link research. Hard stop only if the action would create a hold, reservation, payment step, or real booking. |
| **HTTP-dependent** | `diagnose-discovery-iteration.ts`, `test-booking-prototype.ts`, any script calling `localhost:3000` | **Conditional** â€” only run after operator confirms dev server is up at `localhost:3000`. |
| **Pure Node/DynamoDB** | `check-brief-status.ts`, `check-campaign-exists.ts`, `enqueue-and-run-brief.ts`, `check-agent-job.ts` | **Safe to run autonomously** â€” no browser, no HTTP. |

**Scripts that write output files (the only two):**
- `scripts/scrape-cb-deals.ts` â†’ `.github/data/cb-deals-cache.json`
- `scripts/debug-brief-engine.ts` â†’ `scripts/brief-result.json`

All other scripts write to DynamoDB only. Do not expect or poll for an output file from any other script.

---

### Failure 1 â€” `npx tsx` Scripts Hanging

**Symptom:** Agent runs `npx tsx scripts/run-phase-b.ts` (or similar) and receives no output, no error, no file.

**Root Cause:** (a) Script imports Playwright and blocks waiting for a browser session. (b) Script calls `fetch('http://localhost:3000/...')` and the dev server is not running â€” ECONNREFUSED is swallowed. (c) Neither cause produces visible output, so the hang looks identical from outside.

**Mitigation:**
- Apply the classification table above before calling any script.
- Playwright-dependent scripts may be run autonomously for non-booking CB/Odysseus work; treat only booking-creating actions as a hard stop (see Â§1c Hard Stop List below).
- HTTP-dependent scripts â†’ ask user to confirm dev server first.
- Safe scripts â†’ capture stdout with `$output = npx tsx scripts/... 2>&1` and parse `$output`.

---

### Failure 2 â€” Silent `fetch()` Failure to `localhost:3000`

**Symptom:** Script calls the dev server, produces no stdout, writes no files, exits silently.

**Root Cause:** Dev server is not running. `ECONNREFUSED` is caught internally and the script exits with no output written.

**Mitigation:**
- **Never assume the dev server is running.**
- Before any HTTP call (API routes, manifest checks, etc.), explicitly ask the user: *"I need to call the dev server at `localhost:3000`. Please confirm it's running before I proceed."*
- The operator restarts the server with `npm run dev` â€” the agent cannot do this.
- When server state is uncertain, use Pure Node/DynamoDB scripts for status checks instead of HTTP.

---

### Failure 3 â€” `read_url_content` Blocked for `localhost`

**Symptom:** Agent tries to read `http://localhost:3000/api/...` and gets "Forbidden domain."

**Root Cause:** Security restriction on localhost access â€” **this is permanent and will not change.**

**Rule:** Never call `read_url_content` with a `localhost` URL.

**Alternatives by use case:**

| What the agent needs | Alternative |
|---|---|
| Campaign / brief status | Run `npx tsx scripts/check-brief-status.ts <slug>` (DynamoDB, no HTTP) |
| Phase B match results | Ask user to navigate to `http://localhost:3000/tests/groups/discovery` and describe what they see |
| Media generation status | Ask user to navigate to `http://localhost:3000/tests/media-generation` |
| Any JSON API response | Ask user to run the `Invoke-RestMethod` or `curl` command and paste back the output |
| Job status | Run `npx tsx scripts/check-agent-job.ts <slug> <jobId>` (DynamoDB, no HTTP) |

---

### Failure 4 â€” `read_file` Failing (No Output Files)

**Symptom:** Agent runs a script and then tries to read `scripts/output.json` (or similar) but the file does not exist.

**Root Cause:** Scripts in this project write to DynamoDB, not to files. A hanging script writes nothing. Only two scripts write files (`scrape-cb-deals.ts` and `debug-brief-engine.ts`).

**Mitigation:**
- Do not expect or wait for an output file from any script except the two listed above.
- Capture script output directly from stdout: `$output = npx tsx scripts/check-brief-status.ts <slug> 2>&1`
- Parse `$output` in the agent â€” it contains the same data that would have been in a file.

---

### Checking Campaign State Without HTTP (Safe Pattern)

These commands are safe for autonomous agent execution â€” no browser, no dev server required:

```powershell
# Check if campaign exists in DynamoDB
$output = npx tsx scripts/check-campaign-exists.ts board-games-at-sea 2>&1
Write-Host $output

# Check brief status in DynamoDB
$output = npx tsx scripts/check-brief-status.ts board-games-at-sea 2>&1
Write-Host $output

# Enqueue a brief generation job (writes job record to DynamoDB, no HTTP)
$output = npx tsx scripts/enqueue-and-run-brief.ts board-games-at-sea 2>&1
Write-Host $output

# Check agent job status in DynamoDB
$output = npx tsx scripts/check-agent-job.ts board-games-at-sea <jobId> 2>&1
Write-Host $output
```

---

### Hard Stop List â€” Approval Required Before Real Booking Actions

The agent must **stop and ask for approval before attempting** the following:

1. Any step that would create a **hold**, **reservation**, **payment step**, or **real booking**
2. Any submission of real traveler information into a live supplier checkout flow
3. Confirming or restarting the dev server when operator awareness is needed

**Agent behavior at a hard stop:**
1. State clearly that the next step would create or advance a real booking action.
2. Ask the user for approval before continuing.
3. Do not click through or submit that action until approval is given.

