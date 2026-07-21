import type { BookingDraftStatus } from "@/lib/booking-assistant/contracts";
import type { DraftStoreClients } from "@/lib/booking-assistant/store";
import {
  pollOperatorQueue,
  type OperatorServiceConfig,
} from "@/lib/booking-assistant/operator-service";

export interface QueueCoreLogicInput {
  clients: DraftStoreClients;
  config: OperatorServiceConfig;
  statuses: BookingDraftStatus[];
}

export interface QueueCoreLogicOutput {
  cards: ReturnType<typeof pollOperatorQueue> extends Promise<infer T> ? T : never;
}

export async function queueCoreLogic(
  input: QueueCoreLogicInput
): Promise<QueueCoreLogicOutput> {
  const cards = await pollOperatorQueue(input.clients, input.config, {
    statuses: input.statuses,
  });
  return { cards };
}
