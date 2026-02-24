# Semantic Search Blueprint
**Project**: Leisure Life Interactive  
**Stack**: Next.js 16 · TypeScript · AWS DynamoDB · OpenAI Embeddings  
**Last Updated**: 2026-02-23

---

## Overview

Semantic search in this platform serves one primary purpose: **retrieving contextually relevant user preference data at the right time** during package building, booking flows, and conversational inference.

Standard DB queries (DynamoDB) handle structured lookups. Semantic search kicks in when:
- User profile data exceeds simple key/value retrieval
- We need fuzzy/preference-weighted matching (e.g. "loves lobster dinners + techno shows")
- Conversation history needs to be mined for behavioral signals
- Package recommendations need to rank against learned preferences

---

## Phased Rollout

### Phase 1 — JSON In-Memory Embeddings (Launch)
> **No vector DB. No additional infrastructure. OpenAI embeddings only.**

#### How It Works
1. User conversations and preference summaries are stored as plain text in DynamoDB (per-user)
2. At query time, relevant text chunks are pulled from DynamoDB and embedded **in-memory** using `openai` embeddings API
3. A lightweight cosine similarity function ranks chunks against the query
4. Top-N results are injected into the agent prompt context

#### Data Flow
```
User Message
    │
    ▼
Pull user text chunks from DynamoDB
    │
    ▼
Embed query + chunks via OpenAI text-embedding-3-small
    │
    ▼
Cosine similarity ranking (in-memory)
    │
    ▼
Top-N chunks injected into agent prompt
```

#### DynamoDB Schema (Phase 1)
```
Table: UserMemory
PK: userId (String)
SK: chunkId (String)  → "conv#<timestamp>#<index>"

Attributes:
  - text: String           → raw text chunk (conversation summary, preference note)
  - embedding: String      → JSON-serialized number[] (cached after first embed)
  - type: String           → "conversation" | "preference" | "complaint" | "delight"
  - createdAt: String      → ISO timestamp
  - tags: String[]         → ["food", "entertainment", "destination", "budget", ...]
```

#### Caching Strategy
- Embeddings are computed **once** and stored back to DynamoDB alongside the text
- Re-embedding only occurs when the text chunk is updated
- Cold-path: embed + store. Warm-path: retrieve pre-computed embedding

#### When to Use (Phase 1 Triggers)
- User has > 3 stored conversation chunks
- Agent needs to build a cruise package recommendation
- Agent requests preference context during the Fast Booking flow
- "Tell me about any past cruise complaints" type retrieval

#### Cost Estimate: Phase 1
| Operation | Model | Cost |
|-----------|-------|------|
| Embed query | text-embedding-3-small | ~$0.00002/query |
| Embed new chunk | text-embedding-3-small | ~$0.00002/chunk |
| Storage (DynamoDB) | — | ~$0.25/GB/month |

**Effectively zero cost at launch.**

---

### Phase 2 — Vectra + DynamoDB (Scale)
> **Triggered when: user base grows, per-user chunk count > 50, or query latency becomes noticeable.**

#### What Changes
- [Vectra](https://github.com/Stevenic/vectra) local file-based vector index runs as a **server-side singleton** in the Next.js API layer
- Embeddings written to both DynamoDB (source of truth) and Vectra index (query layer)
- Vectra index is partitioned per-user (`userId` prefix)
- Vectra index files stored on persistent volume (AWS EFS or S3 sync on cold start)

#### Architecture
```
DynamoDB (source of truth)
    │
    ├── On write → embed → store embedding in DynamoDB + Vectra index
    │
    └── On cold start → hydrate Vectra index from DynamoDB embeddings

Next.js API Layer
    │
    └── VectraIndex singleton per userId → fast ANN query at runtime
```

#### Phase 2 Triggers
- avg chunks per user > 50
- Semantic query latency > 800ms
- User base > 500 active users

---

### Phase 3 — Supabase pgvector (Enterprise)
> **Triggered when: > 10,000 embedding records or multi-tenant cross-user search is needed.**

#### What Changes
- Supabase with `pgvector` extension becomes the dedicated vector store
- DynamoDB retains booking/transactional data
- Embeddings migrate from DynamoDB → Supabase `embeddings` table
- Full ANN (Approximate Nearest Neighbor) queries via `pgvector` HNSW index

#### When pgvector Unlocks Value
- Cross-user similarity ("users like you loved these itineraries")
- Fleet-wide preference pattern analysis
- Internal analytics and package performance scoring

---

## Core Implementation: Phase 1

### File Structure
```
lib/
  semantic/
    embed.ts              ← OpenAI embedding wrapper
    similarity.ts         ← cosine similarity + ranking
    memory-retriever.ts   ← DynamoDB fetch + in-memory query
    chunk-writer.ts       ← write/update user memory chunks
    types.ts              ← MemoryChunk, SemanticQuery, SemanticResult types
```

### `SemanticQuery` Type
```typescript
interface SemanticQuery {
  userId: string;
  query: string;
  topN: number;
  filterTypes?: MemoryChunkType[];
}
```

### `MemoryChunk` Type
```typescript
type MemoryChunkType = 'conversation' | 'preference' | 'complaint' | 'delight' | 'booking';

interface MemoryChunk {
  chunkId: string;
  userId: string;
  text: string;
  embedding: number[] | null;
  type: MemoryChunkType;
  tags: string[];
  createdAt: string;
}
```

### `SemanticResult` Type
```typescript
interface SemanticResult {
  chunk: MemoryChunk;
  score: number;
}
```

### Retrieval Algorithm (Phase 1)
```
1. Pull all MemoryChunks for userId from DynamoDB
2. For any chunk with embedding === null → call OpenAI embed → store back
3. Embed the incoming query string
4. Compute cosine similarity: query_embedding · chunk_embedding / (|query| * |chunk|)
5. Sort descending by score
6. Return top-N results above threshold (default: 0.75)
```

---

## Integration Points

### Chat System (CHAT_SYSTEM_BLUEPRINT.md)
- `memory-retriever` is called as a **tool** in the agent tool registry
- Tool name: `retrieve_user_memory`
- Invoked by the agent when entering package-building or preference-synthesis contexts
- Results are formatted as a structured context block injected into the system prompt

### Conversation Summarization
- After each chat session, a summarization agent compresses the conversation into 1–3 memory chunks
- Chunks are typed automatically by the summarizer (complaint, delight, preference, etc.)
- Stored via `chunk-writer.ts`

### Guest Info (GUEST_INFO.json)
- Structured mandatory fields (name, DOB, passport, allergies, etc.) remain in DynamoDB as typed fields
- Only unstructured/conversational data flows through semantic memory
- Semantic search is NEVER used to retrieve structured fields — standard DB query for those

---

## Guardrails

| Rule | Reason |
|------|--------|
| Never embed PII (passport, CC, SSN) | Legal/security — PII stays in encrypted DynamoDB fields only |
| Max chunk size: 500 tokens | Keeps embeddings meaningful and cost low |
| Min similarity threshold: 0.75 | Avoids noisy/irrelevant context injection |
| Max top-N injection: 5 chunks | Keeps prompt context manageable |
| Embeddings cached after first compute | Cost control |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-02-23 | Start with JSON in-memory, no vector DB | Zero infra cost, sufficient for launch |
| 2026-02-23 | DynamoDB as embedding store (Phase 1) | Already in stack, avoid new infra |
| 2026-02-23 | Vectra for Phase 2 | TypeScript-native, file-based, no server |
| 2026-02-23 | Supabase pgvector for Phase 3 | Production-grade ANN at scale, existing Supabase access |
| 2026-02-23 | Never semantic-search structured PII | Security boundary — only unstructured preference text |
