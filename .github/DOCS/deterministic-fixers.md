# Deterministic Fixers

## Purpose

This document is the project-level policy for extending and using deterministic fixers in the aesthetic workflow.

Use it whenever a campaign hits:
- revision deadlock
- repeated red-team blockers
- production-feasibility contradictions
- known structural issues in `CampaignAestheticBrief`, `productionBible`, or storyboard planning

## Core Rule

Add deterministic fixers by reusable issue class, not by one-off campaign hack.

Good deterministic fixer candidates:
- countdown/scarcity cleanup
- exact time removal
- queue/device language cleanup
- venue genericization
- avatar/tool normalization
- rail safety language injection
- filming/privacy safety note injection
- camera-move feasibility normalization
- cabin-type plausibility correction
- gangway exchange relocation/removal
- storyboard duration alignment
- production safety ops injection

Bad deterministic fixer candidates:
- weak vibe
- generic luxury drift
- poor thematic cohesion
- weak community energy
- broad casting feel issues
- creative rewrites that need judgment instead of rule-based mutation

## Deterministic Eligibility Test

A problem should become a deterministic fixer only if all three are true:

1. It maps to a stable issue class that will likely recur across campaigns.
2. It targets known fields or known text patterns in the stored schema.
3. The mutation can be validated with schema checks plus deterministic assertions.

If any of those fail, keep the issue in manual or LLM-revision territory.

## Growth Policy

Expect the deterministic fixer library to grow over time as more campaigns expose recurring structural failures.

Agents should treat each deadlock as a classification problem:
- if the surviving blocker is deterministic, add or extend a reusable fixer and tests
- if the blocker is not deterministic, do not force it into the fixer system

The goal is a growing library of repair primitives, not campaign-specific exceptions.

## Agent Requirements

When working on aesthetic deadlocks or red-team survivors, agents must:

1. Check whether the blocker is already covered by an existing deterministic issue code.
2. If not covered, decide whether it qualifies for a new deterministic fixer using the eligibility test above.
3. If it qualifies, document the new issue class and add tests.
4. Extend the shared modify flow rather than creating a one-off campaign path.

## Documentation Requirements

When adding a new deterministic fixer family:

1. Update this file with the new issue class and rationale.
2. Update repo-level instructions if the workflow expectations changed.
3. Add or extend tests for idempotence, path safety, and acceptance behavior.
4. If the fixer was introduced to unblock a specific campaign, note that campaign in `WORK.txt` or other task-specific planning docs, but keep the fixer design reusable.

## Current Campaign Guidance

`film-and-zine-afloat-2026` is the current forcing function for production-bible/storyboard deterministic fixers.

Those fixers should still be implemented as reusable issue classes, not hardcoded campaign exceptions.