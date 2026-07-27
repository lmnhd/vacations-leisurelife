import assert from "node:assert/strict";
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";

import {
  REMINDER_INTERVAL_MS,
  buildReminderProgram,
  claimReminderProgram,
  reminderSuppressionReason,
} from "../lib/booking-assistant/reminders.ts";

async function run(): Promise<void> {
  const now = new Date("2026-07-26T12:00:00.000Z");
  const intake = buildReminderProgram("draft-1", "continue_later_v1", now);
  assert.equal(Date.parse(intake.nextSendAtIso) - now.getTime(), REMINDER_INTERVAL_MS);
  assert.equal(reminderSuppressionReason(intake, "paused_by_guest", now), null);
  assert.equal(reminderSuppressionReason(intake, "ready_to_call_agent", now), "wrong_lifecycle");
  const call = buildReminderProgram("draft-1", "call_to_finalize_v1", now);
  assert.equal(reminderSuppressionReason(call, "ready_to_call_agent", now), null);
  assert.equal(reminderSuppressionReason(call, "booking_confirmed", now), "draft_terminal");
  assert.notEqual(intake.programId, call.programId);
  let condition = "";
  const dynamo = {
    async send(command: unknown) {
      if (command instanceof UpdateItemCommand) {
        condition = command.input.ConditionExpression ?? "";
        return {};
      }
      throw new Error("Unexpected command");
    },
  };
  await claimReminderProgram(
    dynamo as never,
    { tableName: "lll-booking-assistant", kmsKeyArn: "unused" },
    intake,
    now
  );
  assert.ok(condition.includes("claimExpiresAtIso < :now"));
  console.log("Booking Assistant reminder lifecycle tests passed.");
}

void run();
