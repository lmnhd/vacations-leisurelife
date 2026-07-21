import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { KMSClient } from "@aws-sdk/client-kms";

import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import {
  createGuestStoreClients,
  type GuestStoreClients,
} from "@/lib/booking-assistant/guest-service";

export interface GuestRouteContext {
  clients: GuestStoreClients;
}

/**
 * Creates guest store clients using default AWS credentials (not the
 * assumed operator role). Checks the feature flag and returns null
 * if the booking assistant is disabled.
 */
export async function createGuestRouteContext(): Promise<GuestRouteContext | null> {
  const { operatorAccess } = readBookingAssistantEnvConfig(undefined);
  if (!operatorAccess.enabled) return null;

  const region = operatorAccess.region;
  const dynamo = new DynamoDBClient({ region });
  const kms = new KMSClient({ region });
  const clients = createGuestStoreClients(dynamo, kms, operatorAccess.kmsKeyArn);
  return { clients };
}
