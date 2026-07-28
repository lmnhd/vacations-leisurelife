/**
 * Seed the Klaviyo "Custom Operator Message" event so the metric + a sample
 * profile appear in the Klaviyo dashboard. This lets a template be built
 * against the real event shape BEFORE the operator custom-email code ships.
 *
 * The event name and property keys here MUST match the transport that the
 * Booking Assistant custom-email feature will emit
 * (lib/booking-assistant/notifications.ts). Keep them in sync: the template
 * you build against this seed is what the live sends will render.
 *
 * Event / metric name: "LLL Booking Assistant Custom Operator Message"
 * Event properties available to the template:
 *   - subject                 the operator-authored email subject
 *   - body                    the operator-authored email body (plain text / light HTML)
 *   - deal_label              short sailing label for context
 *   - resume_url              guest secure-resume link (safe to include)
 *   - reminder_controls_url   guest reminder-controls link (safe to include)
 *   - delivery_id             idempotency key for the send
 *
 * Usage:
 *   npm run seed:klaviyo-custom-email -- you@example.com
 *   # or without the npm script:
 *   npx tsx --env-file=.env.local scripts/seed-klaviyo-custom-operator-email.ts you@example.com
 *
 * The email arg is optional; it defaults to a clearly-fake seed address. Use a
 * real inbox you control if you want to preview the rendered template end to end.
 */

import {
  trackKlaviyoEvent,
  upsertKlaviyoProfile,
} from "@/lib/integrations/klaviyo";

// Must equal EVENT_NAMES["custom_operator_message"] in notifications.ts.
const EVENT_NAME = "LLL Booking Assistant Custom Operator Message";

async function main(): Promise<void> {
  const email = (process.argv[2] ?? "seed+custom-operator-email@leisurelife.example").trim();

  if (!process.env.KLAVIYO_PRIVATE_API_KEY) {
    throw new Error(
      "KLAVIYO_PRIVATE_API_KEY is not set. Run with: npx tsx --env-file=.env.local scripts/seed-klaviyo-custom-operator-email.ts <email>"
    );
  }

  const nowIso = new Date().toISOString();
  const deliveryId = `seed-custom-operator-email:${Date.now()}`;

  console.log(`[seed] Upserting Klaviyo profile for ${email} ...`);
  await upsertKlaviyoProfile({ email, firstName: "Seed" });

  console.log(`[seed] Firing "${EVENT_NAME}" ...`);
  const result = await trackKlaviyoEvent({
    email,
    eventName: EVENT_NAME,
    occurredAt: nowIso,
    properties: {
      // Sample values so every template field has something to bind to.
      subject: "Flight options to Miami for your Aug 22 sailing",
      body: [
        "Hi Pat,",
        "",
        "Following up on our call — here are a few flight options into Miami (MIA) the day before your cruise:",
        "",
        "• Delta DL1234 — dep 8:05a, arr 11:40a — from $198 nonstop",
        "• American AA987 — dep 10:15a, arr 1:50p — from $214 nonstop",
        "• JetBlue B6455 — dep 6:30a, arr 10:05a — from $176 nonstop",
        "",
        "Prices change quickly, so grab one soon. Reply here or call me and I'll help you lock it in.",
        "",
        "— Your Leisure Life booking agent",
      ].join("\n"),
      deal_label: "MSC Seaview — 7-Night Caribbean, Aug 22",
      resume_url: "https://example.com/api/booking-assistant/resume?token=SEED_TOKEN",
      reminder_controls_url: "https://example.com/deals/test-deal-001/book",
      delivery_id: deliveryId,
    },
  });

  console.log(
    `[seed] Done. accepted=${result.accepted} delivery_id=${deliveryId}`
  );
  console.log(
    "[seed] In Klaviyo: the metric \"" +
      EVENT_NAME +
      "\" should now exist. Build a flow/template triggered by it that renders {{ event.subject }} and {{ event.body }}."
  );
}

main().catch((error) => {
  console.error("[seed] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
