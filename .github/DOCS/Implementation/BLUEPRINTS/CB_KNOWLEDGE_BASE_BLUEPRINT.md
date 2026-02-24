# Cruise Brothers Knowledge Base Blueprint

> [!NOTE]
> This document details the technical approach and architecture for integrating the Cruise Brothers Knowledge Base tool (`cruise-brothers-knowledge`), an offshoot of the primary `CHAT_SYSTEM_BLUEPRINT.md`.

## The Problem
The agent requires access to Cruise Brothers agent-critical documents, supplier portal guides, commission schedules, and policies (hosted behind a login at `cbagenttools.com`). However, natively logging in, navigating, and scraping these pages on every active chat query would introduce unacceptable latency to the conversation.

## The Solution: Offline Ingestion Architecture
To ensure instant chat responses, the system will employ an **Offline Ingestion Strategy**. A background automation script will periodically scrape the required data and format it into a local, statically accessible cache. The LLM tool will then perform rapid, lightweight queries directly against this local cache.

---

## Technical Implementation Plan

### 1. Data Ingestion Pipeline
**File**: `scripts/ingest-cbagenttools.ts`

- A Playwright-based script that logs into `cbagenttools.com` using the agency credentials.
- Navigates through the **Training / Resources** sections and the **Vendors** directory.
- Extracts meaningful text content, policies, commission rates, and supplier-specific booking procedures.
- Saves the structured data to a local cache file at `.github/data/cb-knowledge-cache.json`.
- This script is meant to be run periodically (e.g., manually by a developer when updates are announced, or via a scheduled cron job).

### 2. Tool Definition
**File**: `.github/prompt-data/tools/agency/cruise-brothers-knowledge.json`

- Defines the JSON tool schema as specified in the master Chat System Blueprint.
- Sets the `tool_id`: `"cruise_brothers_knowledge"`.
- Defines the input schema as `{ "query": "string" }` to allow the LLM to search for specific topics (e.g., "Royal Caribbean Commission" or "Agent Perks guidelines").

### 3. Tool Implementation Layer
**File**: `lib/chat/tools/cruise-brothers-knowledge.ts`

- Implements the standard `ToolHandler` interface for the chat pipeline.
- Loads the `.github/data/cb-knowledge-cache.json` file into memory (or reads dynamically).
- Performs a keyword or semantic search on the cached data based on the agent's provided `query`.
- Returns the formatted context text back to the LLM pipeline, streaming "thoughts" to the UI (e.g., *"Checking Cruise Brothers agent resources..."*).

---

## Verification & Testing

- **Ingestion Test**: Executing `npx ts-node scripts/ingest-cbagenttools.ts` successfully authenticates, navigates to the necessary pages, and populates the JSON cache with readable content.
- **Query Test**: Executing the `cruise-brothers-knowledge.ts` handler directly with test queries returns the correct, expected text snippets from the static file without live HTTP navigation.
