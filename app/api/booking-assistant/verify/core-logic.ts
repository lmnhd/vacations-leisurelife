import type { CallerIdState } from "@/lib/booking-assistant/contracts";
import type { DraftStoreClients } from "@/lib/booking-assistant/store";
import {
  recordCallerVerification,
  type OperatorServiceConfig,
  type CallerVerificationResult,
} from "@/lib/booking-assistant/operator-service";

export interface VerifyCoreLogicInput {
  clients: DraftStoreClients;
  config: OperatorServiceConfig;
  draftId: string;
  expectedVersion: number;
  callerIdState: CallerIdState;
  operatorSessionId: string;
  verificationNotes?: string;
}

export async function verifyCoreLogic(
  input: VerifyCoreLogicInput
): Promise<CallerVerificationResult> {
  return recordCallerVerification(input.clients, input.config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    callerIdState: input.callerIdState,
    operatorSessionId: input.operatorSessionId,
    verificationNotes: input.verificationNotes,
  });
}
