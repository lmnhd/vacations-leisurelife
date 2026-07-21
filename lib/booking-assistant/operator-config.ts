/**
 * Shared configuration for Booking Assistant operator API routes.
 * Reads from environment variables and produces the config objects
 * needed by the local-operator-aws and operator-service modules.
 */

import type { BookingAssistantLocalOperatorConfig } from "./local-operator-aws";
import type { OperatorServiceConfig } from "./operator-service";

const AWS_ACCOUNT_ID = "622703699030";
const TABLE_NAME = "lll-booking-assistant";
const KMS_KEY_ARN = "arn:aws:kms:us-east-1:622703699030:key/46b52934-933f-4c84-8a29-98bbf5c161ea";
const ROLE_ARN = "arn:aws:iam::622703699030:role/LeisureLifeBookingAssistantLocalOperator";

export interface BookingAssistantEnvConfig {
  operatorAccess: BookingAssistantLocalOperatorConfig;
  operatorService: OperatorServiceConfig;
}

export function readBookingAssistantEnvConfig(
  requestHostname: string | undefined
): BookingAssistantEnvConfig {
  const enabled = process.env.BOOKING_ASSISTANT_ENABLED === "true";
  const region = process.env.AWS_REGION ?? "us-east-1";

  const operatorAccess: BookingAssistantLocalOperatorConfig = {
    enabled,
    requestHostname,
    region,
    tableName: TABLE_NAME,
    expectedTableName: TABLE_NAME,
    approvedAwsAccountId: AWS_ACCOUNT_ID,
    approvedRoleArn: ROLE_ARN,
    kmsKeyArn: KMS_KEY_ARN,
  };

  const operatorService: OperatorServiceConfig = {
    tableName: TABLE_NAME,
    kmsKeyArn: KMS_KEY_ARN,
    callIntentTtlSeconds: 120,
    claimLeaseSeconds: 600,
  };

  return { operatorAccess, operatorService };
}
