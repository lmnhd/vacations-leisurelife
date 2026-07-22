import assert from "node:assert/strict";

import {
  evaluateLocalOperatorAccess,
  type LocalOperatorAccessInput,
} from "../lib/booking-assistant/local-operator-access.ts";

const allowedInput: LocalOperatorAccessInput = {
  explicitMode: "enabled",
  nodeEnvironment: "development",
  requestHostname: "localhost",
  configuredTableName: "lll-booking-assistant",
  expectedTableName: "lll-booking-assistant",
  awsAccountId: "123456789012",
  approvedAwsAccountId: "123456789012",
  awsRoleArn: "arn:aws:iam::123456789012:role/BookingAssistantLocalOperator",
  approvedAwsRoleArn: "arn:aws:iam::123456789012:role/BookingAssistantLocalOperator",
  credentialsExpireAtIso: "2026-07-20T18:00:00.000Z",
  nowIso: "2026-07-20T17:00:00.000Z",
};

assert.deepEqual(evaluateLocalOperatorAccess(allowedInput), { allowed: true });

assert.deepEqual(
  evaluateLocalOperatorAccess({ ...allowedInput, requestHostname: "preview.example.com" }),
  { allowed: false, reason: "non_loopback_host" }
);

assert.deepEqual(
  evaluateLocalOperatorAccess({ ...allowedInput, nodeEnvironment: "production" }),
  { allowed: false, reason: "production_environment" }
);

assert.deepEqual(
  evaluateLocalOperatorAccess({ ...allowedInput, awsRoleArn: "arn:aws:iam::123456789012:role/Admin" }),
  { allowed: false, reason: "unexpected_aws_role" }
);

assert.deepEqual(
  evaluateLocalOperatorAccess({ ...allowedInput, credentialsExpireAtIso: allowedInput.nowIso }),
  { allowed: false, reason: "credentials_missing_or_expired" }
);

assert.deepEqual(
  evaluateLocalOperatorAccess({ ...allowedInput, credentialsExpireAtIso: "2026-07-21T18:00:00.000Z" }),
  { allowed: false, reason: "credentials_not_short_lived" }
);

console.log("Booking Assistant local operator access checks passed.");
