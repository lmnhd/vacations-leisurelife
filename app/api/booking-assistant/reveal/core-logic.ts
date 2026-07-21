import type { DraftStoreClients } from "@/lib/booking-assistant/store";
import {
  revealPacket,
  type OperatorServiceConfig,
  type RevealedPacket,
} from "@/lib/booking-assistant/operator-service";

export interface RevealCoreLogicInput {
  clients: DraftStoreClients;
  config: OperatorServiceConfig;
  draftId: string;
  operatorSessionId: string;
}

export async function revealCoreLogic(
  input: RevealCoreLogicInput
): Promise<RevealedPacket> {
  return revealPacket(input.clients, input.config, {
    draftId: input.draftId,
    operatorSessionId: input.operatorSessionId,
  });
}
