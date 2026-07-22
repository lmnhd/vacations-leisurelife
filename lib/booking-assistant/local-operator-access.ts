const MAX_OPERATOR_CREDENTIAL_LIFETIME_MS = 12 * 60 * 60 * 1000;

export interface LocalOperatorAccessInput {
  explicitMode: string | undefined;
  nodeEnvironment: string | undefined;
  requestHostname: string | undefined;
  configuredTableName: string | undefined;
  expectedTableName: string;
  awsAccountId: string | undefined;
  approvedAwsAccountId: string;
  awsRoleArn: string | undefined;
  approvedAwsRoleArn: string;
  credentialsExpireAtIso: string | undefined;
  nowIso: string;
}

export type LocalOperatorAccessDenialReason =
  | "mode_disabled"
  | "production_environment"
  | "non_loopback_host"
  | "unexpected_table"
  | "unexpected_aws_account"
  | "unexpected_aws_role"
  | "credentials_missing_or_expired"
  | "credentials_not_short_lived";

export type LocalOperatorAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: LocalOperatorAccessDenialReason };

export function isLoopbackHostname(hostname: string | undefined): boolean {
  const normalized = hostname?.trim().toLowerCase().split(":")[0];
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

/**
 * Fail-closed preflight for the pilot's localhost operator console.
 *
 * The caller must supply identity obtained server-side from AWS, not values
 * accepted from the browser. This function never reads or returns guest data.
 */
export function evaluateLocalOperatorAccess(
  input: LocalOperatorAccessInput
): LocalOperatorAccessDecision {
  if (input.explicitMode !== "enabled") {
    return { allowed: false, reason: "mode_disabled" };
  }
  if (input.nodeEnvironment === "production") {
    return { allowed: false, reason: "production_environment" };
  }
  if (!isLoopbackHostname(input.requestHostname)) {
    return { allowed: false, reason: "non_loopback_host" };
  }
  if (!input.configuredTableName || input.configuredTableName !== input.expectedTableName) {
    return { allowed: false, reason: "unexpected_table" };
  }
  if (!input.awsAccountId || input.awsAccountId !== input.approvedAwsAccountId) {
    return { allowed: false, reason: "unexpected_aws_account" };
  }
  if (!input.awsRoleArn || input.awsRoleArn !== input.approvedAwsRoleArn) {
    return { allowed: false, reason: "unexpected_aws_role" };
  }

  const now = Date.parse(input.nowIso);
  const expiresAt = input.credentialsExpireAtIso
    ? Date.parse(input.credentialsExpireAtIso)
    : Number.NaN;
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return { allowed: false, reason: "credentials_missing_or_expired" };
  }
  if (expiresAt - now > MAX_OPERATOR_CREDENTIAL_LIFETIME_MS) {
    return { allowed: false, reason: "credentials_not_short_lived" };
  }

  return { allowed: true };
}
