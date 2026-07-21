import type { DraftStoreClients } from "@/lib/booking-assistant/store";
import {
  claimDraft,
  type OperatorServiceConfig,
  type OperatorClaimResult,
} from "@/lib/booking-assistant/operator-service";

export interface ClaimCoreLogicInput {
  clients: DraftStoreClients;
  config: OperatorServiceConfig;
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
}

export async function claimCoreLogic(
  input: ClaimCoreLogicInput
): Promise<OperatorClaimResult> {
  return claimDraft(input.clients, input.config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    operatorSessionId: input.operatorSessionId,
  });
}
