import { appendJournalObservation, queryJournalEvents } from "./activity-journal";
import { loadConversationTurns } from "./conversation-store";
import { buildJourneyReplay } from "./journey-replay";
import { requireActiveOperatorClaim, type OperatorServiceConfig } from "./operator-service";
import { getDraft, type DraftStoreClients } from "./store";

export async function loadOperatorDraftDetail(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: { draftId: string; operatorSessionId: string }
) {
  const draft = await getDraft(clients, config, input.draftId);
  if (!draft) throw new Error("Booking draft was not found");

  await appendJournalObservation(clients.dynamo, config.tableName, {
    draftId: input.draftId,
    eventType: "operator_timeline_accessed",
    actorType: "operator",
    occurredAtIso: new Date().toISOString(),
    privacyClass: "operational",
    idempotencyKey: `timeline-${input.operatorSessionId}-${Date.now()}`,
    payload: { operatorSessionId: input.operatorSessionId },
  });
  const timeline = await queryJournalEvents(clients.dynamo, config.tableName, input.draftId, {
    limit: 200,
  });

  let conversationLocked = true;
  let conversations: Awaited<ReturnType<typeof loadConversationTurns>> = [];
  try {
    await requireActiveOperatorClaim(clients, config, input.draftId, input.operatorSessionId);
    conversationLocked = false;
    conversations = await loadConversationTurns(
      clients.dynamo,
      clients.encryption,
      config,
      input.draftId,
      100
    );
    await appendJournalObservation(clients.dynamo, config.tableName, {
      draftId: input.draftId,
      eventType: "operator_conversation_accessed",
      actorType: "operator",
      occurredAtIso: new Date().toISOString(),
      privacyClass: "booking_pii",
      idempotencyKey: `conversation-${input.operatorSessionId}-${Date.now()}`,
      payload: {
        operatorSessionId: input.operatorSessionId,
        turnCount: conversations.length,
      },
    });
  } catch {
    conversationLocked = true;
  }

  return {
    currentState: {
      bookingDraftId: draft.metadata.bookingDraftId,
      status: draft.metadata.status,
      version: draft.metadata.version,
      packetVersion: draft.metadata.packetVersion,
      completionMode: draft.metadata.completionMode,
      completionModeVersion: draft.metadata.completionModeVersion,
      assignedOperatorId: draft.metadata.assignedOperatorId,
      claimLeaseExpiresAtIso: draft.metadata.claimLeaseExpiresAtIso,
      nextTaskId: draft.metadata.nextTaskId,
      updatedAtIso: draft.metadata.updatedAtIso,
    },
    timeline: timeline.events,
    journey: buildJourneyReplay(timeline.events),
    conversations,
    conversationLocked,
  };
}
