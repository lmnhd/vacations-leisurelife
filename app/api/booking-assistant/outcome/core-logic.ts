import type { CallOutcome } from "@/lib/booking-assistant/contracts";
import type { DraftStoreClients } from "@/lib/booking-assistant/store";
import {
  recordCallOutcome,
  type OperatorServiceConfig,
  type RecordOutcomeResult,
} from "@/lib/booking-assistant/operator-service";

export interface OutcomeCoreLogicInput {
  clients: DraftStoreClients;
  config: OperatorServiceConfig;
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
  outcome: CallOutcome;
  notes?: string;
}

export async function outcomeCoreLogic(
  input: OutcomeCoreLogicInput
): Promise<RecordOutcomeResult> {
  return recordCallOutcome(input.clients, input.config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    operatorSessionId: input.operatorSessionId,
    outcome: input.outcome,
    notes: input.notes,
  });
}
