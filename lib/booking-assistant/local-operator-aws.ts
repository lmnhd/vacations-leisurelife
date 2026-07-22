import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { KMSClient } from "@aws-sdk/client-kms";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import {
  evaluateLocalOperatorAccess,
  type LocalOperatorAccessDenialReason,
} from "./local-operator-access";

export interface BookingAssistantLocalOperatorConfig {
  enabled: boolean;
  requestHostname: string | undefined;
  region: string;
  tableName: string;
  expectedTableName: string;
  approvedAwsAccountId: string;
  approvedRoleArn: string;
  kmsKeyArn: string;
}

export interface BookingAssistantLocalOperatorClients {
  dynamo: DynamoDBClient;
  kms: KMSClient;
  assumedRoleArn: string;
  credentialsExpireAtIso: string;
}

function denialMessage(reason: LocalOperatorAccessDenialReason): string {
  return `Booking Assistant local operator access denied: ${reason}`;
}

/**
 * Creates clients for the localhost-only operator console.
 *
 * Default AWS credentials are used only to assume the dedicated one-hour role.
 * No credential values, guest data, or decrypted fields are logged here.
 */
export async function createBookingAssistantLocalOperatorClients(
  config: BookingAssistantLocalOperatorConfig
): Promise<BookingAssistantLocalOperatorClients> {
  const sourceSts = new STSClient({ region: config.region });
  const sourceIdentity = await sourceSts.send(new GetCallerIdentityCommand({}));

  const temporaryCredentials = fromTemporaryCredentials({
    clientConfig: { region: config.region },
    params: {
      RoleArn: config.approvedRoleArn,
      RoleSessionName: "booking-assistant-local-operator",
      DurationSeconds: 3600,
    },
  });
  const assumedSts = new STSClient({
    region: config.region,
    credentials: temporaryCredentials,
  });
  const assumedIdentity = await assumedSts.send(new GetCallerIdentityCommand({}));
  const credentials = await temporaryCredentials();
  const credentialsExpireAtIso = credentials.expiration?.toISOString();
  if (!credentialsExpireAtIso) {
    throw new Error("Booking Assistant local operator access denied: credentials_missing_or_expired");
  }

  const decision = evaluateLocalOperatorAccess({
    explicitMode: config.enabled ? "enabled" : undefined,
    nodeEnvironment: process.env.NODE_ENV,
    requestHostname: config.requestHostname,
    configuredTableName: config.tableName,
    expectedTableName: config.expectedTableName,
    awsAccountId: assumedIdentity.Account,
    approvedAwsAccountId: config.approvedAwsAccountId,
    awsRoleArn: config.approvedRoleArn,
    approvedAwsRoleArn: config.approvedRoleArn,
    credentialsExpireAtIso,
    nowIso: new Date().toISOString(),
  });
  if (!decision.allowed) {
    throw new Error(denialMessage(decision.reason));
  }
  if (!sourceIdentity.Account || sourceIdentity.Account !== config.approvedAwsAccountId) {
    throw new Error("Booking Assistant local operator access denied: unexpected_source_account");
  }
  if (!assumedIdentity.Arn?.includes("assumed-role/LeisureLifeBookingAssistantLocalOperator/")) {
    throw new Error("Booking Assistant local operator access denied: unexpected_assumed_role");
  }

  return {
    dynamo: new DynamoDBClient({ region: config.region, credentials: temporaryCredentials }),
    kms: new KMSClient({ region: config.region, credentials: temporaryCredentials }),
    assumedRoleArn: assumedIdentity.Arn,
    credentialsExpireAtIso,
  };
}
