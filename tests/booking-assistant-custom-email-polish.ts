import assert from "node:assert/strict";

import { modelForTask, ModelName } from "@/lib/ai/llm-gateway";
import { parsePolishedEmailResponse } from "@/lib/booking-assistant/operator-email-polish";

assert.equal(modelForTask("operator_email_polish"), ModelName.LEGACY_FALLBACK);

const parsed = parsePolishedEmailResponse(
  "```json\n{\"subject\":\"A quick note about your sailing\",\"body\":\"Hello,\\n\\nHere is the information you requested. Please let us know if you have any questions.\\n\\nWarmly,\\nLeisure Life\"}\n```"
);
assert.equal(parsed.subject, "A quick note about your sailing");
assert.equal(parsed.body.includes("Here is the information you requested."), true);

const plainEmail = parsePolishedEmailResponse(
  "Subject: Your upcoming sailing\n\nBody: Thank you for speaking with us. We are happy to help with any questions you have."
);
assert.equal(plainEmail.subject, "Your upcoming sailing");
assert.equal(plainEmail.body.startsWith("Thank you"), true);

assert.throws(() => parsePolishedEmailResponse("   "));

console.log("Booking Assistant custom email polish tests passed.");
