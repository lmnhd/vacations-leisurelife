import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import type { EncryptionHelper } from "./encryption";
import type { BookingNotificationTransport } from "./notifications";
import { assertNotificationHasNoSensitiveSubjectData } from "./notifications";
import {
  claimReminderProgram,
  completeReminderSend,
  deferReminderProgram,
  listDueReminderPrograms,
  releaseReminderClaim,
  reminderSuppressionReason,
  stopReminderProgram,
} from "./reminders";
import { getAgentAvailability } from "./agent-availability";
import { issueResumeToken } from "./resume-tokens";
import { getDraft, type DraftStoreConfig } from "./store";

export interface ReminderWorkerResult {
  inspected: number;
  sent: number;
  suppressed: number;
  failed: number;
}

export async function processDueBookingReminders(
  dynamo: DynamoDBClient,
  encryption: EncryptionHelper,
  config: DraftStoreConfig,
  transport: BookingNotificationTransport,
  publicBaseUrl: string,
  limit = 25
): Promise<ReminderWorkerResult> {
  const now = new Date();
  const programs = await listDueReminderPrograms(dynamo, config, now.toISOString(), limit);
  const result: ReminderWorkerResult = { inspected: programs.length, sent: 0, suppressed: 0, failed: 0 };
  const base = publicBaseUrl.endsWith("/") ? publicBaseUrl.slice(0, -1) : publicBaseUrl;

  for (const program of programs) {
    let claimId = "";
    try {
      claimId = await claimReminderProgram(dynamo, config, program, now);
      const draft = await getDraft({ dynamo, encryption }, config, program.draftId);
      if (!draft) {
        await stopReminderProgram(dynamo, config, program.draftId, "draft_missing");
        result.suppressed += 1;
        continue;
      }
      if (program.programType === "call_to_finalize_v1") {
        const availability = await getAgentAvailability(dynamo, config);
        if (availability.mode === "no_agents") {
          const fallback = now.getTime() + 12 * 60 * 60 * 1000;
          const configuredEnd = Date.parse(availability.effectiveUntilIso ?? "");
          const nextSendAt = Number.isFinite(configuredEnd)
            ? Math.max(configuredEnd + 60 * 60 * 1000, now.getTime() + 60 * 60 * 1000)
            : fallback;
          await deferReminderProgram(
            dynamo,
            config,
            program,
            claimId,
            new Date(nextSendAt).toISOString()
          );
          result.suppressed += 1;
          continue;
        }
      }
      const suppression = reminderSuppressionReason(program, draft.metadata.status, now);
      if (suppression) {
        await stopReminderProgram(dynamo, config, program.draftId, suppression);
        result.suppressed += 1;
        continue;
      }
      const token = await issueResumeToken(dynamo, config, {
        draftId: program.draftId,
        personId: draft.metadata.personId,
        redirectDealId: draft.metadata.dealId,
        ttlSeconds: 30 * 24 * 60 * 60,
      });
      const notification = {
        kind: program.programType === "continue_later_v1"
          ? "continue_later_reminder" as const
          : "ready_to_call_reminder" as const,
        email: draft.contact.email,
        resumeUrl: `${base}/api/booking-assistant/resume?token=${encodeURIComponent(token.token)}`,
        dealLabel: draft.dealSnapshot.dealAngle,
        nextTaskLabel: draft.metadata.resumeTaskId ?? draft.metadata.nextTaskId,
        reminderControlsUrl: `${base}/deals/${encodeURIComponent(draft.metadata.dealId)}/book`,
        idempotencyKey: `${program.programId}:${program.generation + 1}`,
      };
      assertNotificationHasNoSensitiveSubjectData(notification);
      const delivery = await transport.send(notification);
      if (!delivery.accepted) throw new Error("Notification provider did not accept reminder");
      await completeReminderSend(dynamo, config, program, claimId, now);
      result.sent += 1;
    } catch {
      if (claimId) {
        try {
          await releaseReminderClaim(dynamo, config, program, claimId);
        } catch {
          // A lost claim is recovered by the bounded claim-expiry repair job.
        }
      }
      result.failed += 1;
    }
  }
  return result;
}
