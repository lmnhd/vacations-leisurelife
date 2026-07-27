/**
 * Shared helper for operator API routes to create authenticated clients
 * and run the fail-closed local operator access preflight.
 */

import {
  createBookingAssistantLocalOperatorClients,
  type BookingAssistantLocalOperatorClients,
} from "./local-operator-aws";
import { createEncryptionHelper } from "./encryption";
import { readBookingAssistantEnvConfig } from "./operator-config";
import type { DraftStoreClients } from "./store";

export interface OperatorRouteContext {
  clients: DraftStoreClients;
  operatorClients: BookingAssistantLocalOperatorClients;
  operatorSessionId: string;
}

export async function createOperatorRouteContext(
  requestHostname: string | undefined
): Promise<OperatorRouteContext> {
  const { operatorAccess } = readBookingAssistantEnvConfig(requestHostname);
  const operatorClients = await createBookingAssistantLocalOperatorClients(operatorAccess);
  const encryption = createEncryptionHelper(operatorClients.kms, operatorAccess.kmsKeyArn);
  const clients: DraftStoreClients = {
    dynamo: operatorClients.dynamo,
    encryption,
  };
  return {
    clients,
    operatorClients,
    // The pilot has one localhost-only operator. This stable identifier lets a
    // claim lease survive the separate verification/reveal/processing requests.
    // A multi-operator deployment must replace it with authenticated identity.
    operatorSessionId: "local-operator-console",
  };
}
