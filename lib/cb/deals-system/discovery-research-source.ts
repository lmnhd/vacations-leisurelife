/**
 * Read-only consumer of the saved discovery research cache.
 *
 * The Group discovery pipeline (`app/api/groups/discovery/core-logic.ts`) runs
 * Gemini Deep Research and persists the result to
 * `.github/data/discovery-research-cache.json`. The Deals discovery entry point
 * REUSES that saved research to generate retail package ideas — it never triggers
 * a fresh Gemini run itself (those are operator-run via the Group pipeline).
 *
 * This module only READS that file. It imports no Group business logic, keeping
 * Deals decoupled from Groups (AI_POLICY: "keep Deals separate from Groups").
 */

import { existsSync, readFileSync } from "fs";
import path from "path";

export const DISCOVERY_RESEARCH_CACHE_PATH = path.join(
  process.cwd(),
  ".github",
  "data",
  "discovery-research-cache.json"
);

export interface SavedDiscoveryResearch {
  /** Community/psychographic Deep Research text (Group Step 1). */
  psychographicData?: string;
  /** Aesthetic/ship-fit Deep Research text (Group Step 2). */
  aestheticData?: string;
  /** ISO date (YYYY-MM-DD) the research was generated/cached on. */
  cachedAt?: string;
  /** Prompt version stamp the Group pipeline wrote. */
  promptVersion?: string;
}

export interface SavedDiscoveryResearchStatus {
  hasResearch: boolean;
  cachedAt: string | null;
  hasPsychographic: boolean;
  hasAesthetic: boolean;
}

/** The on-disk shape the Group pipeline writes (only the fields we read). */
interface RawResearchCache {
  date?: string;
  promptVersion?: string;
  psychographicData?: string;
  aestheticData?: string;
}

/**
 * Read the saved discovery research, or null if no cache file exists or it is
 * unreadable. Never throws — callers surface an empty-state to the operator.
 */
export function readSavedDiscoveryResearch(): SavedDiscoveryResearch | null {
  if (!existsSync(DISCOVERY_RESEARCH_CACHE_PATH)) return null;
  try {
    const raw = readFileSync(DISCOVERY_RESEARCH_CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as RawResearchCache;
    return {
      psychographicData: parsed.psychographicData,
      aestheticData: parsed.aestheticData,
      cachedAt: parsed.date,
      promptVersion: parsed.promptVersion,
    };
  } catch {
    return null;
  }
}

/** Lightweight status for the discovery page (does not return the research text). */
export function getSavedDiscoveryResearchStatus(): SavedDiscoveryResearchStatus {
  const research = readSavedDiscoveryResearch();
  if (!research) {
    return {
      hasResearch: false,
      cachedAt: null,
      hasPsychographic: false,
      hasAesthetic: false,
    };
  }
  return {
    hasResearch: Boolean(research.psychographicData || research.aestheticData),
    cachedAt: research.cachedAt ?? null,
    hasPsychographic: Boolean(research.psychographicData),
    hasAesthetic: Boolean(research.aestheticData),
  };
}
