import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import {
  buildReminderProgram,
  putExclusiveReminderProgram,
  type ReminderProgram,
  type ReminderProgramType,
} from "./reminders";
import { issueResumeToken } from "./resume-tokens";
import type { DraftStoreConfig } from "./store";
import type {
  BookingNotification,
  BookingNotificationTransport,
} from "./notifications";
import { assertNotificationHasNoSensitiveSubjectData } from "./notifications";

export interface ArmResumeProgramInput {
  draftId: string;
  personId: string;
  dealId: string;
  dealLabel: string;
  email: string;
  nextTaskLabel?: string;
  programType: ReminderProgramType;
  publicBaseUrl: string;
  notificationKind: BookingNotification["kind"];
  idempotencyKey: string;
  fallbackCallKey?: string;
  agencyPhone?: string;
}

export interface ArmResumeProgramResult {
  program: ReminderProgram;
  resumeExpiresAtIso: string;
  notificationAccepted: boolean;
}

export async function armResumeProgram(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  transport: BookingNotificationTransport,
  input: ArmResumeProgramInput
): Promise<ArmResumeProgramResult> {
  const issued = await issueResumeToken(dynamo, config, {
    draftId: input.draftId,
    personId: input.personId,
    redirectDealId: input.dealId,
    ttlSeconds: 30 * 24 * 60 * 60,
  });
  const base = input.publicBaseUrl.endsWith("/")
    ? input.publicBaseUrl.slice(0, -1)
    : input.publicBaseUrl;
  const resumeUrl = `${base}/api/booking-assistant/resume?token=${encodeURIComponent(issued.token)}`;
  const reminderControlsUrl = `${base}/deals/${encodeURIComponent(input.dealId)}/book`;
  const program = buildReminderProgram(input.draftId, input.programType);
  await putExclusiveReminderProgram(dynamo, config, program);

  const notification: BookingNotification = {
    kind: input.notificationKind,
    email: input.email,
    resumeUrl,
    dealLabel: input.dealLabel,
    nextTaskLabel: input.nextTaskLabel,
    fallbackCallKey: input.fallbackCallKey,
    agencyPhone: input.agencyPhone,
    reminderControlsUrl,
    idempotencyKey: input.idempotencyKey,
  };
  assertNotificationHasNoSensitiveSubjectData(notification);
  const delivery = await transport.send(notification);
  return {
    program,
    resumeExpiresAtIso: issued.expiresAtIso,
    notificationAccepted: delivery.accepted,
  };
}
