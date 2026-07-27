import {
  createKlaviyoBookingNotificationTransport,
  type BookingNotificationKind,
} from "../lib/booking-assistant/notifications";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function emailArgument(): string | undefined {
  return (
    argumentValue("--email") ??
    process.argv.slice(2).find((argument) => !argument.startsWith("-"))
  );
}

const kinds: BookingNotificationKind[] = [
  "resume_receipt",
  "continue_later_reminder",
  "ready_to_call_receipt",
  "ready_to_call_reminder",
  "callback_requested_receipt",
  "no_agents_try_later_receipt",
];

async function main(): Promise<void> {
  const email = emailArgument();
  if (!email) {
    throw new Error(
      "Usage: npm run klaviyo:test-booking-assistant -- you@example.com",
    );
  }

  const transport = createKlaviyoBookingNotificationTransport();
  for (const kind of kinds) {
    const result = await transport.send({
      kind,
      email,
      resumeUrl: "https://example.com/booking-assistant-template-preview",
      reminderControlsUrl:
        "https://example.com/booking-assistant-reminder-controls-preview",
      dealLabel: "7-night Caribbean cruise on Allure of the Seas",
      nextTaskLabel: "Traveler details",
      fallbackCallKey: "MAP",
      agencyPhone: "(904) 257-3134",
      callbackWindowLabel: "Jul 28, 9:00 AM-12:00 PM (America/New_York)",
      idempotencyKey: `template-preview:${kind}:${Date.now()}`,
    });
    console.log(`${kind}: ${result.accepted ? "accepted" : "not accepted"}`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
