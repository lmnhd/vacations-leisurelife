import type { RateQualificationType } from "./types";

export interface SupplierQualificationRule {
  ruleId: string;
  supplier: string;
  qualificationType: RateQualificationType;
  minimumAge?: number;
  occupantRule: "one_occupant" | "all_occupants" | "operator_verification";
  claimOnly: boolean;
  sourceVersion: string;
  effectiveAtIso: string;
}

export interface RateQualificationRegistry {
  registryVersion: number;
  rules: readonly SupplierQualificationRule[];
}

export const PILOT_RATE_QUALIFICATION_REGISTRY: RateQualificationRegistry = {
  registryVersion: 1,
  rules: [
    {
      ruleId: "msc-senior-candidate-v1",
      supplier: "MSC Cruises",
      qualificationType: "age_based",
      minimumAge: 65,
      occupantRule: "all_occupants",
      claimOnly: true,
      sourceVersion: "pilot-research-v1",
      effectiveAtIso: "2026-07-26T00:00:00.000Z",
    },
    {
      ruleId: "msc-service-operator-check-v1",
      supplier: "MSC Cruises",
      qualificationType: "military",
      occupantRule: "operator_verification",
      claimOnly: true,
      sourceVersion: "pilot-research-v1",
      effectiveAtIso: "2026-07-26T00:00:00.000Z",
    },
  ],
};

export function qualificationRulesForSupplier(
  supplier: string,
  registry: RateQualificationRegistry = PILOT_RATE_QUALIFICATION_REGISTRY
): readonly SupplierQualificationRule[] {
  return registry.rules.filter((rule) => rule.supplier === supplier);
}

export function isAgeCandidate(
  ages: readonly number[],
  rule: SupplierQualificationRule
): boolean {
  if (rule.minimumAge === undefined || ages.length === 0) return false;
  if (rule.occupantRule === "all_occupants") {
    return ages.every((age) => age >= (rule.minimumAge ?? Number.MAX_SAFE_INTEGER));
  }
  return ages.some((age) => age >= (rule.minimumAge ?? Number.MAX_SAFE_INTEGER));
}
