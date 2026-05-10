"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Loader2,
  RotateCcw,
  GitBranch,
  MapPin,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from "lucide-react";
import type { Campaign, CampaignInventoryCandidate, CampaignInventoryMode, InventoryHealthStatus } from "@/lib/campaigns/types";
import { getLaunchWindowAssessment } from "@/lib/campaigns/launch-window";

// ─── Types ───────────────────────────────────────────────────────────────────

type PricingStatus = "AI_ESTIMATE" | "CB_MATCHED" | "UNMATCHED";

interface PhaseBCampaignRef {
  sailingDateText: string | null;
  daysUntilSail: number | null;
  meetsMinimumLeadTime: boolean | null;
  isTightLeadTime: boolean | null;
  minimumLeadDays: number;
  slug: string;
  name: string;
  pricingStatus: PricingStatus;
  shipTarget?: string;
  matchedShipName?: string;
  matchedSailDate?: string;
  startingPrice?: number;
  priceSource?: string;
  cbPriceAdvantage?: number;
  cbagenttoolsBookingLink?: string;
  // Inventory health & ranked candidates (populated by ranked Phase B)
  activeBookingMode?: CampaignInventoryMode | null;
  inventoryHealth?: InventoryHealthStatus | null;
  inventoryLastCheckedAt?: string | null;
  inventoryCandidates?: CampaignInventoryCandidate[] | null;
}

type PhaseBRunMode = "all" | "selected";

interface BulkRedTeamSummary {
  total: number;
  passed: number;
  warned: number;
  blocked: number;
  failed: number;
}

interface BulkRedTeamResult {
  slug: string;
  name: string;
  outcome: "passed" | "warned" | "blocked" | "failed";
  message: string;
}

interface BulkRevisionSummary {
  total: number;
  revised: number;
  failed: number;
}

interface BulkRevisionResult {
  slug: string;
  outcome: "revised" | "failed";
  message: string;
  campaign?: Campaign;
}

function mergePhaseBStatusIntoBlueprints(
  existingBlueprints: Campaign[],
  phaseBCampaigns: PhaseBCampaignRef[],
): Campaign[] {
  if (existingBlueprints.length === 0 || phaseBCampaigns.length === 0) {
    return existingBlueprints;
  }

  const bySlug = new Map(
    phaseBCampaigns.map((campaign) => [campaign.slug, campaign]),
  );

  return existingBlueprints.map((blueprint) => {
    const phaseBStatus = bySlug.get(blueprint.id);
    if (!phaseBStatus) {
      return blueprint;
    }

    return {
      ...blueprint,
      pricingStatus: phaseBStatus.pricingStatus,
      shipTarget: phaseBStatus.shipTarget ?? blueprint.shipTarget,
      matchedShipName:
        phaseBStatus.matchedShipName ?? blueprint.matchedShipName,
      matchedSailDate:
        phaseBStatus.matchedSailDate ?? blueprint.matchedSailDate,
      startingPrice: phaseBStatus.startingPrice ?? blueprint.startingPrice,
      priceSource: phaseBStatus.priceSource ?? blueprint.priceSource,
      cbPriceAdvantage:
        phaseBStatus.cbPriceAdvantage ?? blueprint.cbPriceAdvantage,
      cbagenttoolsBookingLink:
        phaseBStatus.cbagenttoolsBookingLink ??
        blueprint.cbagenttoolsBookingLink,
    };
  });
}

// ─── Sonar Research Panel ─────────────────────────────────────────────────────

interface SonarResearch {
  psychographic: string;
  aesthetic: string;
}

function SonarResearchPanel({ research }: { research: SonarResearch }) {
  const [openKey, setOpenKey] = useState<"psychographic" | "aesthetic" | null>(
    null,
  );

  const sections: Array<{
    key: "psychographic" | "aesthetic";
    label: string;
    description: string;
  }> = [
    {
      key: "psychographic",
      label: "Step 1 — Psychographic Discovery",
      description: "Cruise-compatible community and leisure-fit analysis",
    },
    {
      key: "aesthetic",
      label: "Step 2 — Cruise Expression / Ship Match",
      description: "Believable theme expression × available CB inventory",
    },
  ];

  return (
    <div className="overflow-hidden border border-amber-500/20 rounded-xl bg-amber-950/10">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/10">
        <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs tracking-widest uppercase text-amber-400">
          Gemini Deep Research
        </span>
        <span className="text-[10px] text-slate-600 ml-1">
          Raw Gemini Deep Research responses — the foundation for all 5 blueprints
        </span>
      </div>
      <div className="divide-y divide-amber-500/10">
        {sections.map(({ key, label, description }) => (
          <div key={key}>
            <button
              onClick={() => setOpenKey(openKey === key ? null : key)}
              className="flex items-center justify-between w-full px-4 py-3 transition-colors hover:bg-amber-500/5"
            >
              <div className="text-left">
                <div className="text-xs text-slate-300">{label}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {description}
                </div>
              </div>
              {openKey === key ? (
                <ChevronUp className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              )}
            </button>
            {openKey === key && (
              <div className="px-4 pb-4">
                <pre className="text-[10px] text-slate-300 bg-slate-900/60 border border-white/5 rounded p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {research[key]}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Blueprint Rationale Card ─────────────────────────────────────────────────

function BlueprintRationaleSection({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  const hasRationale = !!(
    campaign.researchRationale ||
    campaign.successLogic ||
    campaign.audienceSignals?.length ||
    campaign.vacationFitRationale ||
    campaign.cruiseNativeMoments?.length ||
    campaign.nicheExpressionMode ||
    campaign.implausibleLiteralizations?.length ||
    campaign.allowedThemeSignals?.length ||
    campaign.discouragedThemeSignals?.length ||
    campaign.communityFitRationale ||
    campaign.optionalGatheringMoments?.length ||
    campaign.optionalityStyle ||
    campaign.solitudeRisks?.length ||
    campaign.discoveryRedTeamReview
  );
  if (!hasRationale) return null;

  return (
    <div className="mt-3 overflow-hidden border rounded-lg border-cyan-500/15">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-3 py-2 transition-colors bg-cyan-950/20 hover:bg-cyan-950/40"
      >
        <span className="text-[10px] text-cyan-400 uppercase tracking-widest">
          Research Intelligence
        </span>
        {open ? (
          <ChevronUp className="w-3 h-3 text-cyan-400" />
        ) : (
          <ChevronDown className="w-3 h-3 text-cyan-500" />
        )}
      </button>
      {open && (
        <div className="px-3 pt-2 pb-3 bg-cyan-950/10">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.9fr)]">
            <div className="space-y-3">
              {campaign.audienceSignals &&
                campaign.audienceSignals.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1.5">
                      Data Signals
                    </div>
                    <ul className="space-y-1">
                      {campaign.audienceSignals.map((signal, idx) => (
                        <li
                          key={idx}
                          className="text-[10px] text-slate-300 font-sans flex gap-2"
                        >
                          <span className="text-cyan-500 mt-0.5">▸</span>
                          <span>{signal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {campaign.researchRationale && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1">
                    Why This Niche
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                    {campaign.researchRationale}
                  </p>
                </div>
              )}
              {campaign.successLogic && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1">
                    Success Logic
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                    {campaign.successLogic}
                  </p>
                </div>
              )}
              {campaign.vacationFitRationale && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1">
                    Vacation Fit
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                    {campaign.vacationFitRationale}
                  </p>
                </div>
              )}
              {campaign.nicheExpressionMode && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1">
                    Niche Expression Mode
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                    {campaign.nicheExpressionMode}
                  </p>
                </div>
              )}
              {campaign.communityFitRationale && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-fuchsia-500 mb-1">
                    Community Fit
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                    {campaign.communityFitRationale}
                  </p>
                </div>
              )}
              {campaign.optionalityStyle && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-fuchsia-500 mb-1">
                    Optionality Style
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                    {campaign.optionalityStyle}
                  </p>
                </div>
              )}
              {campaign.cruiseNativeMoments &&
                campaign.cruiseNativeMoments.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1.5">
                      Cruise-Native Moments
                    </div>
                    <ul className="space-y-1">
                      {campaign.cruiseNativeMoments.map((moment, idx) => (
                        <li
                          key={idx}
                          className="text-[10px] text-slate-300 font-sans flex gap-2"
                        >
                          <span className="text-cyan-500 mt-0.5">▸</span>
                          <span>{moment}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {campaign.optionalGatheringMoments &&
                campaign.optionalGatheringMoments.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-fuchsia-500 mb-1.5">
                      Optional Gathering Moments
                    </div>
                    <ul className="space-y-1">
                      {campaign.optionalGatheringMoments.map((moment, idx) => (
                        <li
                          key={idx}
                          className="text-[10px] text-slate-300 font-sans flex gap-2"
                        >
                          <span className="text-fuchsia-400 mt-0.5">▸</span>
                          <span>{moment}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {campaign.allowedThemeSignals &&
                campaign.allowedThemeSignals.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-emerald-500 mb-1.5">
                      Allowed Theme Signals
                    </div>
                    <ul className="space-y-1">
                      {campaign.allowedThemeSignals.map((signal, idx) => (
                        <li
                          key={idx}
                          className="text-[10px] text-slate-300 font-sans flex gap-2"
                        >
                          <span className="text-emerald-400 mt-0.5">▸</span>
                          <span>{signal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {campaign.solitudeRisks && campaign.solitudeRisks.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-amber-500 mb-1.5">
                    Solitude Risks
                  </div>
                  <ul className="space-y-1">
                    {campaign.solitudeRisks.map((risk, idx) => (
                      <li
                        key={idx}
                        className="text-[10px] text-slate-300 font-sans flex gap-2"
                      >
                        <span className="text-amber-400 mt-0.5">▸</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {campaign.discouragedThemeSignals &&
                campaign.discouragedThemeSignals.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-amber-500 mb-1.5">
                      Discouraged Theme Signals
                    </div>
                    <ul className="space-y-1">
                      {campaign.discouragedThemeSignals.map((signal, idx) => (
                        <li
                          key={idx}
                          className="text-[10px] text-slate-300 font-sans flex gap-2"
                        >
                          <span className="text-amber-400 mt-0.5">▸</span>
                          <span>{signal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {campaign.implausibleLiteralizations &&
                campaign.implausibleLiteralizations.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-red-500 mb-1.5">
                      Implausible Literalizations
                    </div>
                    <ul className="space-y-1">
                      {campaign.implausibleLiteralizations.map(
                        (signal, idx) => (
                          <li
                            key={idx}
                            className="text-[10px] text-slate-300 font-sans flex gap-2"
                          >
                            <span className="text-red-400 mt-0.5">▸</span>
                            <span>{signal}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
            </div>
            {campaign.discoveryRedTeamReview && (
              <div className="space-y-3 border border-amber-500/15 rounded-lg bg-amber-950/10 p-3 h-fit">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-amber-400 mb-1">
                      Red-Team Suggestions
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                      Stored discovery review for this blueprint.
                    </p>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border ${
                      campaign.discoveryRedTeamReview.verdict === "pass"
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                        : campaign.discoveryRedTeamReview.verdict === "warn"
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                          : "bg-red-500/15 border-red-500/30 text-red-400"
                    }`}
                  >
                    {campaign.discoveryRedTeamReview.verdict}
                  </span>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-amber-500 mb-1">
                    Recommendation
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                    {campaign.discoveryRedTeamReview.approvalRecommendation}
                  </p>
                </div>
                {campaign.discoveryRedTeamReview.requiredFixes.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-red-400 mb-1.5">
                      Required Fixes
                    </div>
                    <ul className="space-y-1">
                      {campaign.discoveryRedTeamReview.requiredFixes.map(
                        (item, idx) => (
                          <li
                            key={idx}
                            className="text-[10px] text-slate-300 font-sans flex gap-2"
                          >
                            <span className="text-red-400 mt-0.5">▸</span>
                            <span>{item}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
                {campaign.discoveryRedTeamReview.optionalImprovements.length >
                  0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-cyan-400 mb-1.5">
                      Optional Improvements
                    </div>
                    <ul className="space-y-1">
                      {campaign.discoveryRedTeamReview.optionalImprovements.map(
                        (item, idx) => (
                          <li
                            key={idx}
                            className="text-[10px] text-slate-300 font-sans flex gap-2"
                          >
                            <span className="text-cyan-400 mt-0.5">▸</span>
                            <span>{item}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
                {campaign.discoveryRedTeamReview.issues.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-amber-500 mb-1.5">
                      Key Issues
                    </div>
                    <div className="space-y-2">
                      {campaign.discoveryRedTeamReview.issues
                        .slice(0, 4)
                        .map((issue, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-white/5 bg-slate-900/40 p-2"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[10px] text-slate-200 font-sans">
                                {issue.title}
                              </span>
                              <span
                                className={`text-[9px] uppercase tracking-widest ${issue.severity === "blocker" ? "text-red-400" : "text-amber-300"}`}
                              >
                                {issue.severity}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-sans leading-relaxed">
                              {issue.recommendation}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {campaign.discoveryIteration && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="text-[9px] uppercase tracking-widest text-slate-400">
                      Iteration Status
                    </div>
                    <div className="text-[10px] text-slate-300 font-sans leading-relaxed">
                      Next action:{" "}
                      <span className="uppercase tracking-widest text-cyan-300">
                        {campaign.discoveryIteration.recommendedNextAction}
                      </span>
                    </div>
                    {campaign.discoveryIteration.recommendedNextAction ===
                      "operator_cleanup" && (
                      <div className="text-[10px] text-sky-300 font-sans leading-relaxed">
                        This blueprint looks discovery-valid, but the remaining
                        issues read like operator or venue-spec cleanup rather
                        than concept failure.
                      </div>
                    )}
                    {campaign.discoveryIteration.stagnant && (
                      <div className="text-[10px] text-amber-300 font-sans leading-relaxed">
                        Stagnation detected:{" "}
                        {campaign.discoveryIteration.stagnationReason ??
                          "This blueprint is repeating the same failure pattern."}
                      </div>
                    )}
                    {campaign.discoveryIteration.retiredAt && (
                      <div className="text-[10px] text-red-300 font-sans leading-relaxed">
                        Retired:{" "}
                        {campaign.discoveryIteration.retirementReason ??
                          "Repeated non-improvement after multiple revisions."}
                      </div>
                    )}
                    {campaign.discoveryIteration.history.length > 0 && (
                      <div className="text-[10px] text-slate-400 font-sans leading-relaxed">
                        Reviews: {campaign.discoveryIteration.reviewCount} ·
                        Revisions: {campaign.discoveryIteration.revisionCount}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inventory Health Badge ────────────────────────────────────────────────────

function InventoryHealthBadge({ status }: { status: InventoryHealthStatus }) {
  const styles: Record<InventoryHealthStatus, string> = {
    HEALTHY: "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300",
    DEGRADED: "bg-amber-500/15 border border-amber-500/30 text-amber-300",
    FAILED: "bg-red-500/15 border border-red-500/30 text-red-300",
    UNVERIFIED: "bg-slate-700/30 border border-slate-600 text-slate-400",
  };
  return (
    <span className={`text-[9px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded ${styles[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

// ─── Phase B Campaign Row (with expandable alternatives) ──────────────────────

function PhaseBCampaignRow({ campaign: c }: { campaign: PhaseBCampaignRef }) {
  const [open, setOpen] = useState(false);
  const candidates = c.inventoryCandidates ?? [];
  const hasCandidates = candidates.length > 0;
  const cbCandidates = candidates.filter((cand) => cand.source === "CB_GROUP");
  const retailCandidate = candidates.find((cand) => cand.source === "ODYSSEUS_RETAIL");

  return (
    <div className="border rounded-lg border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasCandidates}
        className={`flex items-center justify-between w-full px-3 py-2 text-left transition-colors ${hasCandidates ? "hover:bg-white/5 cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">{c.name}</span>
            <span className="text-[10px] text-slate-600">{c.slug}</span>
            {hasCandidates && (
              <span className="text-[9px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                {cbCandidates.length} candidate{cbCandidates.length === 1 ? "" : "s"}
                {retailCandidate ? " + retail" : ""}
              </span>
            )}
            {c.activeBookingMode && c.activeBookingMode !== "GROUP_BLOCK_ACTIVE" && (
              <span
                title={`Active booking mode is ${c.activeBookingMode}. Inventory transitioned away from the original group block.`}
                className="text-[9px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300"
              >
                {c.activeBookingMode.replace(/_/g, " ").toLowerCase()}
              </span>
            )}
          </div>
          {c.matchedShipName && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              {c.matchedShipName}
              {c.matchedSailDate ? ` · ${c.matchedSailDate}` : ""}
              {c.startingPrice ? ` · From $${c.startingPrice.toLocaleString()}/pp` : ""}
            </div>
          )}
          {c.meetsMinimumLeadTime === false && (
            <div className="text-[10px] text-red-300 mt-1">
              Too close to launch normally: {c.daysUntilSail} days until sail.
            </div>
          )}
          {c.isTightLeadTime && (
            <div className="text-[10px] text-amber-300 mt-1">
              Tight launch window: {c.daysUntilSail} days until sail.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {c.inventoryHealth && <InventoryHealthBadge status={c.inventoryHealth} />}
          <PricingBadge status={c.pricingStatus} />
          {hasCandidates && (
            open ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />
          )}
        </div>
      </button>

      {open && hasCandidates && (
        <div className="border-t border-white/5 bg-slate-950/50 px-3 py-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            Ranked candidates · last checked {c.inventoryLastCheckedAt ? new Date(c.inventoryLastCheckedAt).toLocaleString() : "unknown"}
          </p>
          <ol className="space-y-1.5">
            {candidates.map((cand) => (
              <li
                key={`${cand.source}-${cand.rank}-${cand.groupId ?? cand.retailLink ?? cand.shipName}`}
                className="flex items-start gap-3 px-2.5 py-2 rounded bg-slate-900/60 border border-white/5"
              >
                <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500 shrink-0 w-12">
                  {cand.source === "CB_GROUP" ? `Rank ${cand.rank}` : "Retail"}
                </span>
                <div className="flex-1 min-w-0 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-300">{cand.shipName}</span>
                    <span className="text-slate-500">· {cand.sailDate}</span>
                    {cand.departurePort && (
                      <span className="text-slate-500">· {cand.departurePort}</span>
                    )}
                    {cand.startingPrice && (
                      <span className="text-emerald-400">· ${cand.startingPrice.toLocaleString()}/pp</span>
                    )}
                    {cand.priceDeltaFromPrimary !== undefined && cand.priceDeltaFromPrimary !== 0 && (
                      <span className={cand.priceDeltaFromPrimary > 0 ? "text-amber-300" : "text-emerald-300"}>
                        ({cand.priceDeltaFromPrimary > 0 ? "+" : ""}${cand.priceDeltaFromPrimary})
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px]">
                    {cand.source === "CB_GROUP" && (
                      <span
                        title={`Promise delta vs primary: ${cand.promiseDelta}. NONE = same ship/date/port; PRICE_ONLY = price differs ≤10%; AMENITIES_CHANGED = nearby date or port changed; SHIP_OR_DATE_CHANGED = bigger drift.`}
                        className={
                          cand.promiseDelta === "NONE"
                            ? "text-emerald-400"
                            : cand.promiseDelta === "PRICE_ONLY"
                              ? "text-cyan-400"
                              : cand.promiseDelta === "AMENITIES_CHANGED"
                                ? "text-amber-400"
                                : "text-red-400"
                        }
                      >
                        {cand.promiseDelta.replace(/_/g, " ").toLowerCase()}
                      </span>
                    )}
                    {cand.matchScore > 0 && (
                      <span className="text-slate-500">match score: {cand.matchScore}</span>
                    )}
                    {cand.failureReason && (
                      <span className="text-red-400" title={cand.failureReason}>· {cand.failureReason}</span>
                    )}
                  </div>
                  {(cand.personalLink || cand.retailLink) && (
                    <a
                      href={cand.personalLink || cand.retailLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline break-all mt-0.5 inline-block"
                    >
                      {cand.personalLink || cand.retailLink}
                    </a>
                  )}
                </div>
                <InventoryHealthBadge status={cand.healthStatus} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Pricing Badge ────────────────────────────────────────────────────────────

function PricingBadge({ status }: { status: PricingStatus }) {
  const styles: Record<PricingStatus, string> = {
    CB_MATCHED:
      "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400",
    AI_ESTIMATE: "bg-amber-500/15 border border-amber-500/30 text-amber-400",
    UNMATCHED: "bg-red-500/15 border border-red-500/30 text-red-400",
  };
  const labels: Record<PricingStatus, string> = {
    CB_MATCHED: "✅ CB Matched",
    AI_ESTIMATE: "⚠️ AI Estimate",
    UNMATCHED: "❌ Unmatched",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscoveryTestPage() {
  // Phase A state
  const [phaseALoading, setPhaseALoading] = useState(false);
  const [blueprints, setBlueprints] = useState<Campaign[]>([]);
  const [phaseAError, setPhaseAError] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [sonarResearch, setSonarResearch] = useState<SonarResearch | null>(
    null,
  );
  const [bulkRedTeamLoading, setBulkRedTeamLoading] = useState(false);
  const [bulkRedTeamError, setBulkRedTeamError] = useState<string | null>(null);
  const [bulkRedTeamSummary, setBulkRedTeamSummary] =
    useState<BulkRedTeamSummary | null>(null);
  const [bulkRedTeamResults, setBulkRedTeamResults] = useState<
    BulkRedTeamResult[]
  >([]);
  const [selectedBlueprintSlugs, setSelectedBlueprintSlugs] = useState<
    string[]
  >([]);
  const [bulkRevisionLoading, setBulkRevisionLoading] = useState(false);
  const [reviewLoadingSlug, setReviewLoadingSlug] = useState<string | null>(
    null,
  );
  const [revisionLoadingSlug, setRevisionLoadingSlug] = useState<string | null>(
    null,
  );
  const [revisionMessage, setRevisionMessage] = useState<string | null>(null);
  const [retireLoadingSlug, setRetireLoadingSlug] = useState<string | null>(null);

  // Two-stage pipeline (research / generate split)
  const [researchCacheStatus, setResearchCacheStatus] = useState<{
    hasCache: boolean;
    cachedAt: string | null;
    hasPsychographic: boolean;
    hasAesthetic: boolean;
    promptVersion: string | null;
    isCurrentVersion: boolean;
  } | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  // Phase B state
  const [phaseBLoading, setPhaseBLoading] = useState(false);
  const [phaseBCampaigns, setPhaseBCampaigns] = useState<PhaseBCampaignRef[]>(
    [],
  );
  const [phaseBError, setPhaseBError] = useState<string | null>(null);
  const [phaseBRunning, setPhaseBRunning] = useState(false);
  const phaseBPollingIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);

  const clearPhaseBPollingInterval = useCallback(() => {
    if (phaseBPollingIntervalRef.current) {
      clearInterval(phaseBPollingIntervalRef.current);
      phaseBPollingIntervalRef.current = null;
    }
  }, []);

  // Auto-load existing campaigns from DynamoDB on mount
  useEffect(() => {
    const loadExisting = async () => {
      try {
        const res = await fetch("/api/groups/discovery?load=true");
        const data = await res.json();
        if (!data.success || !data.campaigns?.length) return;

        const fetched = await Promise.all(
          (
            data.campaigns as Array<{
              id: string;
              name: string;
              fetchUrl: string;
            }>
          ).map(async (ref) => {
            const r = await fetch(ref.fetchUrl);
            const d = await r.json();
            return d.success ? (d.campaign as Campaign) : null;
          }),
        );
        const loaded = fetched.filter((b): b is Campaign => b !== null);
        if (loaded.length > 0) setBlueprints(loaded);
        setSelectedBlueprintSlugs([]);
      } catch {
        // Silent — auto-load is best-effort
      }
    };
    loadExisting();
  }, []);

  useEffect(() => {
    return () => {
      clearPhaseBPollingInterval();
    };
  }, [clearPhaseBPollingInterval]);

  // ─── Research cache status (for two-stage pipeline UI) ─────────────────────
  const refreshResearchCacheStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/groups/discovery/research");
      const data = (await res.json()) as { success?: boolean; cache?: typeof researchCacheStatus };
      if (data.success && data.cache) setResearchCacheStatus(data.cache);
    } catch {
      // Silent — cache status is informational
    }
  }, []);

  useEffect(() => {
    void refreshResearchCacheStatus();
  }, [refreshResearchCacheStatus]);

  // ─── Phase A ─────────────────────────────────────────────────────────────

  const handleGenerate = async (respin: boolean = false) => {
    const confirmed = window.confirm(
      `This will make 2× Gemini Deep Research calls + 1× GPT-5 structured generation call${respin ? ", bypass cache, and feed prior campaign/red-team feedback into the new run" : ""}.\n\n` +
        "Continue?",
    );
    if (!confirmed) return;

    setPhaseALoading(true);
    setPhaseAError(null);
    setBlueprints([]);
    setSkippedCount(0);

    try {
      const discoveryRes = await fetch(
        `/api/groups/discovery${respin ? "?respin=true" : ""}`,
      );
      const discoveryData = await discoveryRes.json();

      if (!discoveryData.success || !discoveryData.campaigns) {
        setPhaseAError(discoveryData.error || "Discovery pipeline failed");
        return;
      }

      setSkippedCount(discoveryData.skippedCount ?? 0);
      if (discoveryData.sonarResearch) {
        setSonarResearch(discoveryData.sonarResearch as SonarResearch);
      }

      const campaignRefs: Array<{
        id: string;
        name: string;
        fetchUrl: string;
      }> = discoveryData.campaigns;
      const fetched = await Promise.all(
        campaignRefs.map(async (ref) => {
          const res = await fetch(ref.fetchUrl);
          const data = await res.json();
          return data.success ? (data.campaign as Campaign) : null;
        }),
      );

      setBlueprints(fetched.filter((b): b is Campaign => b !== null));
      setSelectedBlueprintSlugs([]);
    } catch (err) {
      setPhaseAError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPhaseALoading(false);
    }
  };

  // ─── Two-stage pipeline handlers ──────────────────────────────────────────

  const handleRunResearch = async (force: boolean) => {
    const confirmed = window.confirm(
      `Run Stage 1: Gemini Deep Research only (Steps 1+2).\n\n` +
        (force
          ? "Force=true: bypass same-day cache, call Gemini fresh.\n\n"
          : "Will reuse same-day cache if available.\n\n") +
        "After this completes, click \"Generate Blueprints from Research\" to add campaigns without re-paying for Gemini.\n\nContinue?",
    );
    if (!confirmed) return;

    setResearchLoading(true);
    setPhaseAError(null);

    try {
      const res = await fetch("/api/groups/discovery/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        research?: { psychographic: string; aesthetic: string };
        cache?: typeof researchCacheStatus;
      };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Research failed");

      if (data.research) {
        setSonarResearch({
          psychographic: data.research.psychographic,
          aesthetic: data.research.aesthetic,
        });
      }
      if (data.cache) setResearchCacheStatus(data.cache);
      setRevisionMessage(data.message ?? "Research complete.");
    } catch (error) {
      setPhaseAError(error instanceof Error ? error.message : "Research failed");
    } finally {
      setResearchLoading(false);
    }
  };

  const handleGenerateFromResearch = async (respin: boolean) => {
    if (!researchCacheStatus?.hasPsychographic || !researchCacheStatus?.hasAesthetic) {
      setPhaseAError(
        "No cached research available. Click \"Run Research\" first to populate the cache.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Run Stage 2: GPT-5 blueprint generation against cached research from ${researchCacheStatus.cachedAt}.\n\n` +
        (respin
          ? "Re-spin: prior-campaign feedback will be injected into the GPT prompt.\n\n"
          : "") +
        "This adds new blueprints to the existing slate (idempotent on slug — duplicates are skipped). Does NOT call Gemini.\n\nContinue?",
    );
    if (!confirmed) return;

    setGenerateLoading(true);
    setPhaseAError(null);

    try {
      const res = await fetch("/api/groups/discovery/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respin }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        hint?: string;
        message?: string;
        skippedCount?: number;
        campaigns?: Array<{ id: string; name: string; fetchUrl: string }>;
        sonarResearch?: SonarResearch;
      };
      if (!res.ok || !data.success) {
        throw new Error([data.error, data.hint].filter(Boolean).join(" — "));
      }

      setSkippedCount(data.skippedCount ?? 0);
      if (data.sonarResearch) setSonarResearch(data.sonarResearch);

      // Fetch the new campaigns and merge them into the blueprints list (don't wipe existing)
      if (data.campaigns?.length) {
        const fetched = await Promise.all(
          data.campaigns.map(async (ref) => {
            const r = await fetch(ref.fetchUrl);
            const d = (await r.json()) as { success?: boolean; campaign?: Campaign };
            return d.success ? d.campaign ?? null : null;
          }),
        );
        const newCampaigns = fetched.filter((c): c is Campaign => c !== null);
        setBlueprints((current) => {
          const existingIds = new Set(current.map((c) => c.id));
          return [...current, ...newCampaigns.filter((c) => !existingIds.has(c.id))];
        });
      }
      setRevisionMessage(data.message ?? "Blueprint generation complete.");
    } catch (error) {
      setPhaseAError(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleClear = () => {
    setBlueprints([]);
    setPhaseAError(null);
    setSkippedCount(0);
    setSonarResearch(null);
    setBulkRedTeamError(null);
    setBulkRedTeamSummary(null);
    setBulkRedTeamResults([]);
    setSelectedBlueprintSlugs([]);
    setRevisionMessage(null);
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      "⚠️ This will permanently delete ALL campaigns from DynamoDB and clear the research cache.\n\n" +
        "Use this to wipe stale Phase A results before a fresh inventory-aligned run.\n\nContinue?",
    );
    if (!confirmed) return;
    await fetch("/api/groups/discovery/clear", { method: "DELETE" });
    handleClear();
  };

  const handleBulkRedTeam = async () => {
    const confirmed = window.confirm(
      "This will run the GPT-5 high discovery red-team validator across every loaded blueprint using raw Phase A research only.\n\n" +
        "Saved verdicts will be written directly onto the blueprint and used by the discovery re-spin flow immediately, before aesthetics exists.\n\nContinue?",
    );
    if (!confirmed) return;

    setBulkRedTeamLoading(true);
    setBulkRedTeamError(null);
    setBulkRedTeamSummary(null);
    setBulkRedTeamResults([]);
    setRevisionMessage(null);

    try {
      const response = await fetch("/api/groups/discovery/red-team/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugs: blueprints.map((blueprint) => blueprint.id),
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        summary?: BulkRedTeamSummary;
        results?: Array<BulkRedTeamResult & { campaign?: Campaign }>;
      };

      if (!response.ok || !data.success || !data.summary || !data.results) {
        throw new Error(data.error ?? "Bulk red team failed");
      }

      setBulkRedTeamSummary(data.summary);
      setBulkRedTeamResults(data.results);
      const updatedCampaigns = new Map(
        data.results
          .filter(
            (result): result is BulkRedTeamResult & { campaign: Campaign } =>
              !!result.campaign,
          )
          .map((result) => [result.slug, result.campaign]),
      );
      setBlueprints((current) =>
        current.map((item) => updatedCampaigns.get(item.id) ?? item),
      );
    } catch (error: unknown) {
      setBulkRedTeamError(
        error instanceof Error ? error.message : "Bulk red team failed",
      );
    } finally {
      setBulkRedTeamLoading(false);
    }
  };

  const handleReviewBlueprint = async (slug: string) => {
    const blueprint = blueprints.find((item) => item.id === slug);
    if (!blueprint) {
      return;
    }

    const confirmed = window.confirm(
      `This will run discovery review for \"${blueprint.name}\" only.\n\n` +
        "The updated verdict will be written onto this card and used by future re-spin passes.\n\nContinue?",
    );
    if (!confirmed) return;

    setReviewLoadingSlug(slug);
    setPhaseAError(null);
    setBulkRedTeamError(null);
    setRevisionMessage(null);

    try {
      const response = await fetch(`/api/groups/discovery/red-team/${slug}`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        campaign?: Campaign;
        review?: { approvalRecommendation?: string };
      };

      if (!response.ok || !data.success || !data.campaign) {
        throw new Error(data.error ?? "Discovery review failed");
      }

      setBlueprints((current) =>
        current.map((item) =>
          item.id === slug ? (data.campaign as Campaign) : item,
        ),
      );
      setBulkRedTeamSummary(null);
      setBulkRedTeamResults([]);
      const nextAction =
        data.campaign.discoveryIteration?.recommendedNextAction;
      const retirementReason =
        data.campaign.discoveryIteration?.retirementReason;
      setRevisionMessage(
        retirementReason
          ? `${data.campaign.name} was retired from the active loop. ${retirementReason}`
          : nextAction === "operator_cleanup"
            ? `${data.campaign.name} needs operator cleanup rather than another structural rewrite. Review the remaining ops/spec warnings, then re-check.`
            : data.review?.approvalRecommendation
              ? `${data.review.approvalRecommendation}${nextAction ? ` Next action: ${nextAction}.` : ""}`
              : `Reviewed ${data.campaign.name}.${nextAction ? ` Next action: ${nextAction}.` : ""}`,
      );
    } catch (error: unknown) {
      setPhaseAError(
        error instanceof Error ? error.message : "Discovery review failed",
      );
    } finally {
      setReviewLoadingSlug(null);
    }
  };

  const handleReviseBlueprint = async (slug: string) => {
    const blueprint = blueprints.find((item) => item.id === slug);
    if (!blueprint) {
      return;
    }

    const confirmed = window.confirm(
      `This will revise \"${blueprint.name}\" in place using its current discovery review.\n\n` +
        "The stale review will be cleared after revision, and you should run Discovery Review again on the revised blueprint.\n\nContinue?",
    );
    if (!confirmed) return;

    setRevisionLoadingSlug(slug);
    setPhaseAError(null);
    setBulkRedTeamError(null);
    setRevisionMessage(null);

    try {
      const response = await fetch("/api/groups/discovery/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        campaign?: Campaign;
        message?: string;
        revisionMode?: "single" | "branch3";
        branchesConsidered?: number;
      };

      if (!response.ok || !data.success || !data.campaign) {
        throw new Error(data.error ?? "Discovery revision failed");
      }

      setBlueprints((current) =>
        current.map((item) =>
          item.id === slug ? (data.campaign as Campaign) : item,
        ),
      );
      setBulkRedTeamSummary(null);
      setBulkRedTeamResults([]);
      setSelectedBlueprintSlugs((current) =>
        current.filter((item) => item !== slug),
      );
      setRevisionMessage(
        data.message ??
          `Revised ${data.campaign.name}. Run Discovery Review again to evaluate the updated blueprint.`,
      );
    } catch (error: unknown) {
      setPhaseAError(
        error instanceof Error ? error.message : "Discovery revision failed",
      );
    } finally {
      setRevisionLoadingSlug(null);
    }
  };

  const toggleBlueprintSelection = (slug: string) => {
    setSelectedBlueprintSlugs((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );
  };

  const handleReviseSelected = async () => {
    if (selectedBlueprintSlugs.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `This will revise ${selectedBlueprintSlugs.length} selected blueprint(s) in place using their current discovery reviews.\n\n` +
        "Selected cards must already have a stored discovery review. Revised cards will have their stale reviews cleared and will need re-review.\n\nContinue?",
    );
    if (!confirmed) return;

    setBulkRevisionLoading(true);
    setPhaseAError(null);
    setBulkRedTeamError(null);
    setRevisionMessage(null);

    try {
      const response = await fetch("/api/groups/discovery/revise/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: selectedBlueprintSlugs }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        summary?: BulkRevisionSummary;
        results?: BulkRevisionResult[];
      };

      if (!response.ok || !data.success || !data.summary || !data.results) {
        throw new Error(data.error ?? "Revise selected failed");
      }

      const revisedCampaigns = new Map(
        data.results
          .filter(
            (result): result is BulkRevisionResult & { campaign: Campaign } =>
              result.outcome === "revised" && !!result.campaign,
          )
          .map((result) => [result.slug, result.campaign]),
      );

      setBlueprints((current) =>
        current.map((item) => revisedCampaigns.get(item.id) ?? item),
      );
      setSelectedBlueprintSlugs([]);
      setRevisionMessage(
        `Revised ${data.summary.revised} selected blueprint(s)${data.summary.failed > 0 ? `, ${data.summary.failed} failed` : ""}. Re-review revised cards to validate them.`,
      );
    } catch (error: unknown) {
      setPhaseAError(
        error instanceof Error ? error.message : "Revise selected failed",
      );
    } finally {
      setBulkRevisionLoading(false);
    }
  };

  // ─── Manual retirement (operator-driven) ──────────────────────────────────

  const handleRetireBlueprint = async (slug: string) => {
    const blueprint = blueprints.find((item) => item.id === slug);
    if (!blueprint) return;

    const reason = window.prompt(
      `Retire "${blueprint.name}"?\n\n` +
        "Retired campaigns are hidden from the discovery view by default but stay in the database " +
        "and continue feeding deduplication into new research runs.\n\n" +
        "Optional reason:",
      "Past launch window / not pursuing this wave",
    );
    if (reason === null) return;

    setRetireLoadingSlug(slug);
    setPhaseAError(null);
    setRevisionMessage(null);

    try {
      const response = await fetch(`/api/groups/discovery/retire/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string; campaign?: Campaign };
      if (!response.ok || !data.success || !data.campaign) {
        throw new Error(data.error ?? "Retire failed");
      }
      setBlueprints((current) =>
        current.map((item) => (item.id === slug ? (data.campaign as Campaign) : item)),
      );
      setRevisionMessage(`Retired ${blueprint.name}. It is hidden from the default view but still excluded from new research runs.`);
    } catch (error: unknown) {
      setPhaseAError(error instanceof Error ? error.message : "Retire failed");
    } finally {
      setRetireLoadingSlug(null);
    }
  };

  const handleUnretireBlueprint = async (slug: string) => {
    const blueprint = blueprints.find((item) => item.id === slug);
    if (!blueprint) return;

    setRetireLoadingSlug(slug);
    setPhaseAError(null);
    setRevisionMessage(null);

    try {
      const response = await fetch(`/api/groups/discovery/retire/${slug}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { success?: boolean; error?: string; campaign?: Campaign };
      if (!response.ok || !data.success || !data.campaign) {
        throw new Error(data.error ?? "Unretire failed");
      }
      setBlueprints((current) =>
        current.map((item) => (item.id === slug ? (data.campaign as Campaign) : item)),
      );
      setRevisionMessage(`Restored ${blueprint.name} to the active discovery list.`);
    } catch (error: unknown) {
      setPhaseAError(error instanceof Error ? error.message : "Unretire failed");
    } finally {
      setRetireLoadingSlug(null);
    }
  };

  // ─── Phase B ─────────────────────────────────────────────────────────────

  const pollPhaseBStatus = useCallback(async () => {
    const res = await fetch("/api/groups/discovery/phase-b");
    const data = (await res.json()) as {
      campaigns?: PhaseBCampaignRef[];
      running?: boolean;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load Phase B status");
    }

    const campaigns = data.campaigns ?? [];
    setPhaseBCampaigns(campaigns);
    setBlueprints((current) =>
      mergePhaseBStatusIntoBlueprints(current, campaigns),
    );
    if (!data.running) {
      clearPhaseBPollingInterval();
      setPhaseBRunning(false);
      setPhaseBLoading(false);
    }
  }, [clearPhaseBPollingInterval]);

  const startPhaseBPolling = useCallback(() => {
    clearPhaseBPollingInterval();
    phaseBPollingIntervalRef.current = setInterval(() => {
      void pollPhaseBStatus().catch((error: unknown) => {
        clearPhaseBPollingInterval();
        setPhaseBError(
          error instanceof Error ? error.message : "Phase B polling failed",
        );
        setPhaseBLoading(false);
        setPhaseBRunning(false);
      });
    }, 5000);
  }, [clearPhaseBPollingInterval, pollPhaseBStatus]);

  const selectedPhaseBSlugs = selectedBlueprintSlugs.filter((slug) =>
    blueprints.some((bp) => bp.id === slug),
  );

  const handleRunPhaseB = async (mode: PhaseBRunMode) => {
    const isSelectedRun = mode === "selected";
    if (isSelectedRun && selectedPhaseBSlugs.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Phase B will open a Playwright browser, log into CB Agent Tools,\n` +
        "scrape live group inventory, and match campaigns.\n\n" +
        `${isSelectedRun ? `Target scope: ${selectedPhaseBSlugs.length} selected campaign(s).\n\n` : "Target scope: all campaigns needing inventory verification.\n\n"}` +
        "Ensure CB_EMAIL and CB_PASSWORD are set in .env.local.\n\nContinue?",
    );
    if (!confirmed) return;

    setPhaseBLoading(true);
    setPhaseBError(null);
    setPhaseBRunning(true);

    try {
      clearPhaseBPollingInterval();

      const response = await fetch("/api/groups/discovery/phase-b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSelectedRun ? { slugs: selectedPhaseBSlugs } : {},
        ),
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Phase B failed to start");
      }

      await pollPhaseBStatus();
      startPhaseBPolling();
    } catch (err) {
      setPhaseBError(err instanceof Error ? err.message : "Phase B failed");
      clearPhaseBPollingInterval();
      setPhaseBLoading(false);
      setPhaseBRunning(false);
    }
  };

  const handleLoadPhaseBStatus = async () => {
    try {
      await pollPhaseBStatus();
    } catch (err) {
      setPhaseBError(
        err instanceof Error ? err.message : "Failed to load Phase B status",
      );
    }
  };

  // ─── Filters ──────────────────────────────────────────────────────────────
  // recencyFilter: "new" = show 5 most recent, "all" = show all
  // pricingFilter: filter by Phase B match status
  // launchFilter: filter by sail-date proximity (lead-time bands)
  // showRetired: hidden by default — operator-retired campaigns are excluded
  // unless this is on. Retired campaigns still feed deduplication for new
  // research runs even when hidden from this UI.
  const [recencyFilter, setRecencyFilter] = useState<"all" | "new">("new");
  const [pricingFilter, setPricingFilter] = useState<"all" | "matched" | "estimate" | "unmatched">("all");
  const [launchFilter, setLaunchFilter] = useState<"all" | "healthy" | "tight" | "past_minimum">("all");
  const [showRetired, setShowRetired] = useState(false);

  const hasPhaseAResults = blueprints.length > 0;
  const revisableBlueprints = blueprints.filter(
    (bp) => !!bp.discoveryRedTeamReview,
  );
  const selectedRevisableCount = selectedBlueprintSlugs.filter((slug) =>
    revisableBlueprints.some((bp) => bp.id === slug),
  ).length;

  function isCampaignRetired(bp: Campaign): boolean {
    return !!bp.discoveryIteration?.retiredAt
      || bp.discoveryIteration?.recommendedNextAction === 'retire';
  }

  function matchesPricingFilter(bp: Campaign): boolean {
    if (pricingFilter === "all") return true;
    const status = bp.pricingStatus ?? "AI_ESTIMATE";
    if (pricingFilter === "matched") return status === "CB_MATCHED";
    if (pricingFilter === "estimate") return status === "AI_ESTIMATE";
    return status === "UNMATCHED";
  }

  function matchesLaunchFilter(bp: Campaign): boolean {
    if (launchFilter === "all") return true;
    const assessment = getLaunchWindowAssessment({
      matchedSailDate: bp.matchedSailDate,
      targetDates: bp.targetDates,
    });
    const days = assessment.daysUntilSail;
    if (days === null) return false;
    if (launchFilter === "past_minimum") return days < 180;
    if (launchFilter === "tight") return days >= 180 && days < 210;
    return days >= 210; // healthy
  }

  // Sort campaigns descending by createdAt, so the newest ones are always first
  const sortedBlueprints = [...blueprints].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  const filteredBlueprints = sortedBlueprints
    .filter((bp) => showRetired || !isCampaignRetired(bp))
    .filter(matchesPricingFilter)
    .filter(matchesLaunchFilter);

  const visibleBlueprints =
    recencyFilter === "new" ? filteredBlueprints.slice(0, 5) : filteredBlueprints;

  const retiredCount = blueprints.filter(isCampaignRetired).length;
  const activeCount = blueprints.length - retiredCount;

  return (
    <div className="min-h-screen p-6 font-mono text-white bg-slate-950">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="p-4 border border-white/10 rounded-xl bg-slate-900/50">
          <h1 className="text-lg font-semibold tracking-wide text-cyan-400">
            🔍 Group Campaign Discovery
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Phase A — Sonar deep research → 5 structured blueprints. Phase B —
            Playwright CB inventory match → live pricing + booking links.
          </p>
        </div>

        {/* ─── Phase A ─────────────────────────────────────────────── */}
        <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
          <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-white/5 gap-4">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-sm font-medium tracking-widest uppercase text-slate-300">
                  Phase A — AI Discovery
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  2× Gemini Deep Research + 1× GPT-5 structured generation
                </p>
              </div>
            </div>
            {/* ─── Action groups (Generate · Review · Destructive) ────── */}
            <div className="flex flex-wrap gap-2">
              {/* GENERATE group — primary blueprint creation */}
              <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
                {blueprints.length > 0 && (
                  <button
                    onClick={() => void handleGenerate(true)}
                    disabled={phaseALoading}
                    title="Re-Spin (all-in-one): Runs all 3 steps (Gemini psychographic + Gemini aesthetic + GPT-5 blueprints) and adds new campaigns to the existing slate. Bypasses Gemini cache. For most iterative work, prefer the cheaper two-stage flow: Run Research → Generate from Research."
                    className="text-xs px-3 py-1.5 rounded border border-fuchsia-500/30 text-fuchsia-400 hover:text-fuchsia-300 hover:border-fuchsia-400/60 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <RotateCcw className="w-3 h-3" /> Re-Spin
                  </button>
                )}
                <button
                  onClick={() => void handleGenerate(false)}
                  disabled={phaseALoading || hasPhaseAResults}
                  title="Run the full 3-step discovery pipeline in one shot (Gemini psychographic + Gemini aesthetic + GPT-5 blueprints). Disabled once results are loaded — use Re-Spin to add more, or Reset to clear local state first."
                  className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  {phaseALoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                      Researching…
                    </>
                  ) : hasPhaseAResults ? (
                    "Results Loaded"
                  ) : (
                    "Generate Blueprints"
                  )}
                </button>
              </div>

              {/* TWO-STAGE group — research and generate independently */}
              <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
                <button
                  onClick={() => void handleRunResearch(researchCacheStatus?.hasCache ?? false)}
                  disabled={researchLoading}
                  title="Run Research (Stage 1): Calls Gemini Deep Research Steps 1+2 only. Caches the output. Use this to refresh the research foundation without burning GPT credits. Cheap to repeat with force=true if same-day cache exists."
                  className="text-xs px-3 py-1.5 rounded border border-amber-500/30 text-amber-300 hover:text-amber-200 hover:border-amber-400/60 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {researchLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Researching…
                    </>
                  ) : researchCacheStatus?.hasCache ? (
                    <>🔬 Refresh Research</>
                  ) : (
                    <>🔬 Run Research</>
                  )}
                </button>
                <button
                  onClick={() => void handleGenerateFromResearch(blueprints.length > 0)}
                  disabled={
                    generateLoading ||
                    !researchCacheStatus?.hasPsychographic ||
                    !researchCacheStatus?.hasAesthetic
                  }
                  title="Generate Blueprints from Research (Stage 2): Runs GPT-5 against the cached research. Adds new campaigns to the slate without re-calling Gemini. Use this to iteratively grow the slate. If the research cache is empty, click Run Research first."
                  className="text-xs px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 hover:border-emerald-400/60 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {generateLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>✨ Generate from Research</>
                  )}
                </button>
                {/* Cache freshness pill */}
                <span
                  title={
                    researchCacheStatus?.hasCache
                      ? `Research cache last written ${researchCacheStatus.cachedAt}. Prompt version: ${researchCacheStatus.promptVersion ?? "unknown"} ${researchCacheStatus.isCurrentVersion ? "(current)" : "(stale prompt — will be invalidated on next run)"}.`
                      : "No research cache. Stage 2 (Generate from Research) is disabled until you Run Research."
                  }
                  className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded border ${
                    researchCacheStatus?.hasCache && researchCacheStatus.isCurrentVersion
                      ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                      : researchCacheStatus?.hasCache
                        ? "border-amber-500/30 text-amber-300 bg-amber-500/10"
                        : "border-slate-600 text-slate-500 bg-slate-900/50"
                  }`}
                >
                  {researchCacheStatus?.hasCache
                    ? `Cache: ${researchCacheStatus.cachedAt}${researchCacheStatus.isCurrentVersion ? "" : " (stale)"}`
                    : "Cache: empty"}
                </span>
              </div>

              {/* REVIEW group — red-team validation + revision */}
              {hasPhaseAResults && (
                <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
                  <button
                    onClick={() => void handleBulkRedTeam()}
                    disabled={phaseALoading || bulkRedTeamLoading}
                    title="Review All: Runs the discovery red-team validator (GPT-5) against every loaded blueprint and persists the verdict (pass / warn / block) on each card. Used by Re-Spin to feed feedback into the next generation."
                    className="text-xs px-3 py-1.5 rounded border border-amber-500/30 text-amber-400 hover:text-amber-300 hover:border-amber-400/60 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {bulkRedTeamLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" /> Reviewing
                        All…
                      </>
                    ) : (
                      <>
                        <GitBranch className="w-3 h-3" /> Review All
                      </>
                    )}
                  </button>
                  {revisableBlueprints.length > 0 && (
                    <button
                      onClick={() => void handleReviseSelected()}
                      disabled={bulkRevisionLoading || selectedRevisableCount === 0}
                      title="Revise Selected: For checked cards that already have a stored review, regenerates the blueprint in place using that review's feedback. Cleared review must be re-run after revision."
                      className="text-xs px-3 py-1.5 rounded border border-cyan-500/30 text-cyan-300 hover:text-cyan-200 hover:border-cyan-400/60 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {bulkRevisionLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Revising
                          Selected…
                        </>
                      ) : (
                        `Revise Selected${selectedRevisableCount > 0 ? ` (${selectedRevisableCount})` : ""}`
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* DESTRUCTIVE group — local + permanent reset */}
              <div className="flex items-center gap-1.5">
                {hasPhaseAResults && (
                  <button
                    onClick={handleClear}
                    title="Reset: Clears the loaded blueprints from this UI only. Database records are untouched — refresh or click Generate Blueprints again to reload them."
                    className="text-xs px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition-all flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
                <button
                  onClick={handleClearAll}
                  title="Clear All (DESTRUCTIVE): Permanently deletes every campaign METADATA record from DynamoDB and clears the research cache. Cannot be undone. Use Retire on individual campaigns to keep them in the database but hide them from this view."
                  className="text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-400/60 transition-all flex items-center gap-1.5"
                >
                  🗑 Clear All
                </button>
              </div>
            </div>
          </div>

          {/* ─── Filter bar ──────────────────────────────────────────── */}
          {blueprints.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-slate-950/40">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Filters</span>
              <div className="flex rounded-md overflow-hidden border border-slate-700">
                <button
                  onClick={() => setRecencyFilter("new")}
                  title="Show only the 5 most recently created blueprints."
                  className={`px-3 py-1 text-[10px] uppercase tracking-widest transition-colors ${recencyFilter === "new" ? "bg-cyan-500/20 text-cyan-400 font-bold" : "bg-slate-900 text-slate-500 hover:text-slate-300"}`}
                >
                  Newest 5
                </button>
                <button
                  onClick={() => setRecencyFilter("all")}
                  title="Show all blueprints matching the active filters."
                  className={`px-3 py-1 text-[10px] uppercase tracking-widest transition-colors ${recencyFilter === "all" ? "bg-cyan-500/20 text-cyan-400 font-bold" : "bg-slate-900 text-slate-500 hover:text-slate-300"}`}
                >
                  All ({filteredBlueprints.length})
                </button>
              </div>

              <select
                value={pricingFilter}
                onChange={(e) => setPricingFilter(e.target.value as typeof pricingFilter)}
                title="Filter by Phase B inventory match status. CB Matched = personal booking link confirmed; AI Estimate = pre-Phase-B; Unmatched = Phase B couldn't find inventory."
                className="bg-slate-900 border border-slate-700 text-[10px] uppercase tracking-widest text-slate-300 px-2 py-1 rounded"
              >
                <option value="all">Pricing: All</option>
                <option value="matched">CB Matched</option>
                <option value="estimate">AI Estimate</option>
                <option value="unmatched">Unmatched</option>
              </select>

              <select
                value={launchFilter}
                onChange={(e) => setLaunchFilter(e.target.value as typeof launchFilter)}
                title="Filter by days-until-sail lead time. Healthy = 210+ days, Tight = 180–210 days, Past minimum = under 180 days (campaign cannot launch)."
                className="bg-slate-900 border border-slate-700 text-[10px] uppercase tracking-widest text-slate-300 px-2 py-1 rounded"
              >
                <option value="all">Launch window: All</option>
                <option value="healthy">Healthy (210+ days)</option>
                <option value="tight">Tight (180–210 days)</option>
                <option value="past_minimum">Past minimum (&lt;180 days)</option>
              </select>

              <label
                title="Retired campaigns are hidden from the discovery view by default. They stay in the database and continue to feed deduplication into new research runs."
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={showRetired}
                  onChange={(e) => setShowRetired(e.target.checked)}
                  className="accent-fuchsia-500"
                />
                Show retired ({retiredCount})
              </label>

              <span className="text-[10px] text-slate-600 ml-auto">
                Showing {visibleBlueprints.length} of {activeCount} active{retiredCount > 0 ? ` (+${retiredCount} retired)` : ""}
              </span>
            </div>
          )}

          <div className="p-4">
            {skippedCount > 0 && (
              <div className="px-3 py-2 mb-3 text-xs border rounded text-amber-400 bg-amber-500/10 border-amber-500/20">
                ⚠️ {skippedCount} blueprint(s) already existed in DynamoDB and
                were skipped.
              </div>
            )}
            {phaseAError && (
              <div className="px-3 py-2 mb-3 text-xs text-red-400 border rounded bg-red-500/10 border-red-500/20">
                {phaseAError}
              </div>
            )}
            {bulkRedTeamError && (
              <div className="px-3 py-2 mb-3 text-xs text-red-400 border rounded bg-red-500/10 border-red-500/20">
                {bulkRedTeamError}
              </div>
            )}
            {bulkRedTeamSummary && (
              <div className="px-3 py-2 mb-3 text-xs border rounded bg-amber-500/10 border-amber-500/20 text-amber-200 space-y-1">
                <div>
                  Discovery review complete: {bulkRedTeamSummary.passed} passed,{" "}
                  {bulkRedTeamSummary.warned} warned,{" "}
                  {bulkRedTeamSummary.blocked} blocked,{" "}
                  {bulkRedTeamSummary.failed} failed.
                </div>
                <div className="text-[10px] text-amber-300/80">
                  Discovery re-spin now reads these persisted blueprint verdicts
                  and recommendations when generating the next set of
                  blueprints.
                </div>
              </div>
            )}
            {revisionMessage && (
              <div className="px-3 py-2 mb-3 text-xs border rounded bg-cyan-500/10 border-cyan-500/20 text-cyan-200">
                {revisionMessage}
              </div>
            )}
            {bulkRedTeamResults.length > 0 && (
              <div className="mb-3 overflow-hidden border rounded-lg border-amber-500/20 bg-amber-950/10">
                <div className="px-3 py-2 border-b border-amber-500/10 text-[10px] uppercase tracking-widest text-amber-400">
                  Discovery Review Results
                </div>
                <div className="divide-y divide-amber-500/10">
                  {bulkRedTeamResults.map((result) => (
                    <div
                      key={result.slug}
                      className="px-3 py-2 text-[10px] font-sans flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="text-slate-200">{result.name}</div>
                        <div className="text-slate-500">{result.slug}</div>
                      </div>
                      <div className="max-w-[55%] text-right">
                        <div
                          className={`uppercase tracking-widest ${
                            result.outcome === "passed"
                              ? "text-emerald-400"
                              : result.outcome === "warned"
                                ? "text-amber-300"
                                : result.outcome === "blocked" ||
                                    result.outcome === "failed"
                                  ? "text-red-400"
                                  : "text-slate-500"
                          }`}
                        >
                          {result.outcome}
                        </div>
                        <div className="text-slate-400 leading-relaxed">
                          {result.message}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasPhaseAResults ? (
              <div className="space-y-4">
                {visibleBlueprints.map((bp, i) => {
                  const isMatched = bp.pricingStatus === "CB_MATCHED";
                  const isUnmatched = bp.pricingStatus === "UNMATCHED";
                  const displayedShip =
                    bp.matchedShipName ?? bp.shipTarget ?? "TBD";
                  const launchWindow = getLaunchWindowAssessment({
                    matchedSailDate: bp.matchedSailDate,
                    targetDates: bp.targetDates,
                  });
                  const isRetired = !!bp.discoveryIteration?.retiredAt;
                  const isStagnant = !!bp.discoveryIteration?.stagnant;
                  const needsOperatorCleanup =
                    bp.discoveryIteration?.recommendedNextAction ===
                    "operator_cleanup";
                  const isRevisable = !!bp.discoveryRedTeamReview;
                  return (
                    <div
                      key={bp.id || i}
                      className={`border rounded-xl overflow-hidden bg-slate-800/30 ${isMatched ? "border-emerald-500/30" : isUnmatched ? "border-red-500/20" : "border-white/10"}`}
                    >
                      {/* Card Header */}
                      <div className={`flex items-start justify-between gap-4 px-5 py-4 ${isMatched ? "bg-emerald-950/20" : isUnmatched ? "bg-red-950/10" : "bg-slate-800/50"}`}>
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedBlueprintSlugs.includes(bp.id)}
                            onChange={() => toggleBlueprintSelection(bp.id)}
                            disabled={
                              bulkRevisionLoading ||
                              revisionLoadingSlug === bp.id ||
                              reviewLoadingSlug === bp.id
                            }
                            className="mt-1 h-4 w-4 flex-shrink-0 rounded border-white/20 bg-slate-900 text-cyan-400"
                            aria-label={`Select ${bp.name} for batch actions`}
                          />
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-white leading-snug">
                              {bp.name}
                            </div>
                            <div className="text-xs text-slate-400 mt-1 font-sans">
                              {bp.aesthetic} · {bp.targetDates}
                            </div>
                            <div className="text-[10px] text-slate-600 mt-0.5 font-mono">
                              {bp.id}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <PricingBadge
                            status={
                              (bp.pricingStatus ??
                                "AI_ESTIMATE") as PricingStatus
                            }
                          />
                          <div className="flex flex-wrap justify-end gap-1">
                            {isStagnant && !isRetired && (
                              <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border bg-amber-500/15 border-amber-500/30 text-amber-300">
                                stagnant
                              </span>
                            )}
                            {needsOperatorCleanup && !isRetired && (
                              <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border bg-sky-500/15 border-sky-500/30 text-sky-300">
                                operator cleanup
                              </span>
                            )}
                            {isRetired && (
                              <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border bg-red-500/15 border-red-500/30 text-red-400">
                                retired
                              </span>
                            )}
                            {bp.discoveryRedTeamReview && (
                              <span
                                className={`text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border ${
                                  bp.discoveryRedTeamReview.verdict === "pass"
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                    : bp.discoveryRedTeamReview.verdict === "warn"
                                      ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                                      : "bg-red-500/15 border-red-500/30 text-red-400"
                                }`}
                              >
                                review {bp.discoveryRedTeamReview.verdict}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Card Body */}
                      <div className="px-5 py-4 space-y-3">
                        {launchWindow.meetsMinimumLeadTime === false && (
                          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                            Launch window failed: {launchWindow.daysUntilSail}{" "}
                            days until sail — minimum required lead time is{" "}
                            {launchWindow.minimumLeadDays} days.
                          </div>
                        )}
                        {launchWindow.isTightLeadTime && (
                          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            Tight launch window: {launchWindow.daysUntilSail}{" "}
                            days until sail — viable but inside the operator
                            warning band.
                          </div>
                        )}
                        <p className="text-sm text-slate-300 font-sans leading-relaxed">
                          {bp.description}
                        </p>

                        {/* Ship + pricing */}
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <MapPin className="w-3.5 h-3.5" /> {displayedShip}
                          </span>
                          {bp.startingPrice && (
                            <span className="text-emerald-400">
                              From ${bp.startingPrice.toLocaleString()}/pp ·{" "}
                              {bp.priceSource}
                            </span>
                          )}
                          {bp.cbPriceAdvantage && (
                            <span className="text-cyan-400">
                              {bp.cbPriceAdvantage}% price advantage
                            </span>
                          )}
                        </div>

                        {/* CB booking link */}
                        {bp.cbagenttoolsBookingLink && (
                          <div className="text-xs">
                            <span className="text-slate-500">Booking: </span>
                            <a
                              href={bp.cbagenttoolsBookingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline break-all text-cyan-400 hover:text-cyan-300"
                            >
                              {bp.cbagenttoolsBookingLink}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 px-5 py-3 bg-slate-900/40 border-t border-white/5">
                        <a
                          href={`/api/groups/campaign/${bp.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white transition-all"
                        >
                          View JSON
                        </a>
                        <button
                          onClick={() => void handleReviewBlueprint(bp.id)}
                          disabled={
                            reviewLoadingSlug === bp.id ||
                            revisionLoadingSlug === bp.id ||
                            bulkRevisionLoading
                          }
                          className="text-xs px-3 py-1.5 rounded border border-amber-500/20 text-amber-300 hover:text-amber-200 hover:border-amber-400/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {reviewLoadingSlug === bp.id
                            ? "Reviewing…"
                            : bp.discoveryRedTeamReview
                              ? "Re-Review"
                              : "Review"}
                        </button>
                        {isRevisable && (
                          <button
                            onClick={() => void handleReviseBlueprint(bp.id)}
                            disabled={
                              revisionLoadingSlug === bp.id ||
                              reviewLoadingSlug === bp.id ||
                              bulkRevisionLoading
                            }
                            className="text-xs px-3 py-1.5 rounded border border-cyan-500/20 text-cyan-400 hover:text-cyan-300 hover:border-cyan-400/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          >
                            {revisionLoadingSlug === bp.id
                              ? "Revising…"
                              : "Revise"}
                          </button>
                        )}
                        {isCampaignRetired(bp) ? (
                          <button
                            onClick={() => void handleUnretireBlueprint(bp.id)}
                            disabled={retireLoadingSlug === bp.id}
                            title="Restore this campaign to the active discovery list."
                            className="ml-auto text-xs px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 hover:border-emerald-400/60 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          >
                            {retireLoadingSlug === bp.id ? "Restoring…" : "Unretire"}
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleRetireBlueprint(bp.id)}
                            disabled={retireLoadingSlug === bp.id}
                            title="Retire this campaign. It stays in the database (and continues feeding deduplication into new research) but is hidden from this view by default. Reversible."
                            className="ml-auto text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          >
                            {retireLoadingSlug === bp.id ? "Retiring…" : "Retire"}
                          </button>
                        )}
                      </div>

                      {/* Research Intelligence (collapsible) */}
                      <BlueprintRationaleSection campaign={bp} />
                    </div>
                  );
                })}
              </div>
            ) : (
              !phaseALoading && (
                <div className="py-8 text-xs text-center text-slate-600">
                  Click "Generate Blueprints" to begin deep research.
                </div>
              )
            )}
          </div>
        </div>

        {/* ─── Sonar Research ─────────────────────────────────────── */}
        {sonarResearch && <SonarResearchPanel research={sonarResearch} />}

        {/* ─── Phase B ─────────────────────────────────────────────── */}
        <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div>
              <span className="text-sm font-medium tracking-widest uppercase text-slate-300">
                Phase B — CB Inventory Match
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Playwright CBAT scrape · Requires CB_EMAIL + CB_PASSWORD in
                .env.local
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLoadPhaseBStatus}
                className="text-xs px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition-all"
              >
                <GitBranch className="inline w-3 h-3 mr-1" /> Load Status
              </button>
              <button
                onClick={() => void handleRunPhaseB("selected")}
                disabled={phaseBLoading || selectedPhaseBSlugs.length === 0}
                className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                {phaseBRunning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Matching…
                  </>
                ) : (
                  `Match Selected${selectedPhaseBSlugs.length > 0 ? ` (${selectedPhaseBSlugs.length})` : ""}`
                )}
              </button>
              <button
                onClick={() => void handleRunPhaseB("all")}
                disabled={phaseBLoading}
                className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium bg-violet-500/20 border border-violet-500/40 text-violet-400 hover:bg-violet-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                {phaseBRunning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Matching…
                  </>
                ) : (
                  "Match All"
                )}
              </button>
            </div>
          </div>

          <div className="p-4">
            {hasPhaseAResults && (
              <div className="px-3 py-2 mb-3 text-xs border rounded bg-sky-500/10 border-sky-500/20 text-sky-200">
                <strong>This is a status overview of every campaign in the database</strong> — it always shows all campaigns, not just the ones you matched. Use the blueprint checkboxes above to target a selected-only Phase B run; "Match All" refreshes everything. Click a matched row to see ranked backup candidates and link health.
              </div>
            )}
            {phaseBError && (
              <div className="px-3 py-2 mb-3 text-xs text-red-400 border rounded bg-red-500/10 border-red-500/20">
                {phaseBError}
              </div>
            )}

            {phaseBRunning && (
              <div className="flex items-center gap-2 px-3 py-2 mb-3 text-xs border rounded text-violet-400 bg-violet-500/10 border-violet-500/20">
                <Loader2 className="w-3 h-3 animate-spin" />
                Scraping CB view_groups… polling every 5s
              </div>
            )}

            {phaseBCampaigns.length > 0 ? (
              <div className="space-y-2">
                {phaseBCampaigns.map((c) => (
                  <PhaseBCampaignRow key={c.slug} campaign={c} />
                ))}
              </div>
            ) : (
              !phaseBRunning && (
                <div className="py-8 text-xs text-center text-slate-600">
                  Click "Load Status" to check existing campaigns, "Match
                  Selected" to target checked cards, or "Match All" to start a
                  full Phase B run.
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
