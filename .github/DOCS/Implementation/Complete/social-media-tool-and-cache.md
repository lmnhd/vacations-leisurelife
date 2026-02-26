# Social Media Tool and Agent Tool Cache Layer Implementation

## 1. Social Media Insights Tool implementation
**File:** `lib/chat/tools/social-media-insights.ts`

To fulfill the "AI FIRST" requirement, rather than building custom scrapers for YouTube, Reddit, Instagram, etc., we utilized the Perplexity API (model `sonar`) which has native real-time internet search capabilities. 

We mapped the existing schema expectations to the AI prompt:
- Replaced the placeholder throw error with a real fetch call to `https://api.perplexity.ai/chat/completions`.
- Formatted the system prompt to explicitly restrict the output to a raw JSON matching the expected structure (`common_highlights`, `common_complaints`, `sentiment_summary`).
- Handled LLM quirks by stripping markdown blocks (e.g., ```json ... ```) before parsing.

## 2. Agent Tool Caching Layer

To reduce latency and API costs for repetitive requests (e.g. searching the exact same cruise ship on Perplexity, or checking the exact same excursion port), we introduced a generic caching layer in front of the tools.

### 2.1 Database Schema
**File:** `prisma/schema.prisma`
Added the `AgentToolCache` model:
- `toolId` (String): e.g. "perplexity_cruise_research"
- `payloadHash` (String): Deterministic SHA-256 hash of the input JSON arguments
- `response` (String): Serialized JSON response
- `expiresAt` (DateTime): TTL to manage data staleness

### 2.2 Cache Service
**File:** `lib/chat/tool-cache.ts`
- Added `hashPayload` function that recursively sorts keys before hashing to guarantee that `{a: 1, b: 2}` and `{b: 2, a: 1}` evaluate to the same string.
- Implemented `getToolCache(toolId, payload)` that fetches from Prisma and asynchronously deletes expired records.
- Implemented `setToolCache(toolId, payload, response, ttlSeconds)` using Prisma `upsert`.

### 2.3 Dispatcher Integration
**File:** `lib/chat/tool-dispatcher.ts`
Updated the dispatcher loop to intercept all allowed tool calls:
- Checks `getToolCache` right before tool execution.
- On Cache Hit: Bypasses the tool handler and immediately injects the cached response into the LLM context.
- On Cache Miss: Runs the tool and then asynchronously calls `setToolCache`.
- Tool-specific TTL configurations applied:
  - `perplexity_cruise_research`: 24 hours
  - `cruise_brothers_knowledge`: 7 days
  - `excursion_finder`: 7 days
  - `cruise_brothers_scraper`: 6 hours
  - `pricing_comparator`: 7 days
  - `odysseus_search`: 4 hours
  - `social_media_insights`: 30 days
  - *Note: Action/Mutation tools like `package_builder` and `cruise_groups_manager` skip the cache entirely.*

### 2.4 Pipeline Logger Update
**File:** `lib/chat/pipeline-logger.ts`
Added `'cache_hit'` to the allowed statuses for `pipelineLog.tool` to properly track cache metrics during chat sessions.
