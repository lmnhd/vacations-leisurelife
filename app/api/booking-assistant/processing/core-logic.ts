import type { DraftStoreClients } from "@/lib/booking-assistant/store";
import {
  startAgentProcessing,
  type OperatorServiceConfig,
  type StartProcessingResult,
} from "@/lib/booking-assistant/operator-service";

export interface ProcessingCoreLogicInput {
  clients: DraftStoreClients;
  config: OperatorServiceConfig;
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
}

export async function processingCoreLogic(
  input: ProcessingCoreLogicInput
): Promise<StartProcessingResult> {
  return startAgentProcessing(input.clients, input.config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    operatorSessionId: input.operatorSessionId,
  });
}
