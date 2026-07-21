import type { DraftStoreClients } from "@/lib/booking-assistant/store";
import {
  lookupByFallbackKey,
  type OperatorServiceConfig,
  type FallbackKeyLookupOutput,
} from "@/lib/booking-assistant/operator-service";

export interface LookupCoreLogicInput {
  clients: DraftStoreClients;
  config: OperatorServiceConfig;
  rawKeyInput: string;
  operatorSessionId: string;
}

export async function lookupCoreLogic(
  input: LookupCoreLogicInput
): Promise<FallbackKeyLookupOutput> {
  return lookupByFallbackKey(input.clients, input.config, {
    rawKeyInput: input.rawKeyInput,
    operatorSessionId: input.operatorSessionId,
  });
}
