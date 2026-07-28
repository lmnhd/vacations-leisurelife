import { z } from "zod";

import { modelForTask, runToolAgent } from "@/lib/ai/llm-gateway";

import { assertCustomEmailTextSafe } from "./operator-custom-email";

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 8_000;

const EmailDraftSchema = z.object({
  subject: z.string().min(2).max(MAX_SUBJECT_LENGTH),
  body: z.string().min(2).max(MAX_BODY_LENGTH),
});

export interface PolishOperatorEmailInput {
  subject: string;
  body: string;
}

export interface PolishOperatorEmailResult {
  subject: string;
  body: string;
  model: string;
}

function removeCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  const firstNewline = trimmed.indexOf("\n");
  const lastFence = trimmed.lastIndexOf("```");
  if (firstNewline === -1 || lastFence <= firstNewline) return trimmed;
  return trimmed.slice(firstNewline + 1, lastFence).trim();
}

function parsePlainEmailResponse(
  value: string,
  fallbackSubject: string
): { subject: string; body: string } | null {
  const lines = value.trim().split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  const subjectPrefix = "subject:";
  const bodyPrefix = "body:";

  if (firstLine.toLowerCase().startsWith(subjectPrefix)) {
    const subject = firstLine.slice(subjectPrefix.length).trim();
    const bodyStart = lines.findIndex((line) => line.trim().toLowerCase().startsWith(bodyPrefix));
    const body = bodyStart >= 0
      ? lines.slice(bodyStart).join("\n").trim().slice(bodyPrefix.length).trim()
      : lines.slice(1).join("\n").trim();
    return subject.length > 0 && body.length > 0 ? { subject, body } : null;
  }

  return value.trim().length > 0
    ? { subject: fallbackSubject, body: value.trim() }
    : null;
}

export function parsePolishedEmailResponse(
  value: string,
  fallbackSubject = "A note from Leisure Life"
): { subject: string; body: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(removeCodeFence(value));
  } catch {
    parsed = parsePlainEmailResponse(removeCodeFence(value), fallbackSubject);
  }
  const draft = EmailDraftSchema.safeParse(parsed);
  if (!draft.success) {
    throw new Error("The email rewrite was incomplete. Please try again.");
  }
  return draft.data;
}

/**
 * Turn a Copilot research brief into a guest-ready email draft. This is only
 * preparation: the operator must still review and explicitly send it.
 */
export async function polishOperatorEmailDraft(
  input: PolishOperatorEmailInput
): Promise<PolishOperatorEmailResult> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(`Subject must be no more than ${MAX_SUBJECT_LENGTH} characters.`);
  }
  if (body.length < 2 || body.length > MAX_BODY_LENGTH) {
    throw new Error(`Message must be between 2 and ${MAX_BODY_LENGTH} characters.`);
  }

  if (subject.length > 0) assertCustomEmailTextSafe("subject", subject);
  assertCustomEmailTextSafe("message", body);

  const response = await runToolAgent(
    modelForTask("operator_email_polish"),
    [
      "Rewrite this operator research draft as a guest email.",
      "Return only a plain email draft. Put Subject: followed by the subject on the first line, then a blank line, then the email body.",
      "The subject must be concise. The body must be a warm, clear email of two to four short paragraphs.",
      "If the original is only a quick idea, develop it into a complete helpful email without inventing cruise-specific facts.",
      "Use only supported guest-facing facts already present in the draft. Do not add facts, prices, deadlines, guarantees, recommendations, or legal interpretations.",
      "Remove markdown headings, citations, URLs, source lists, internal notes, agent guidance, research limitations, and instructions aimed at the operator.",
      "For insurance or policy subjects, keep the language informational and neutral. Do not recommend a policy or judge the guest's existing coverage.",
      "Do not include payment, identity, proof, phone, email, or street-address details.",
      "This draft will be reviewed by a human operator before it can be sent.",
      "\nOriginal subject (may be blank; create one when it is):\n" + subject,
      "\nOriginal body:\n" + body,
    ].join("\n"),
    {
      systemPrompt: [
        "You prepare concise guest-facing email drafts for a human cruise agent.",
        "Never imply that a booking, hold, payment, insurance enrollment, or supplier change has occurred.",
        "Follow the requested plain-email output contract exactly.",
      ].join(" "),
      functions: [],
      executeFunction: async () => {
        throw new Error("This email-polish request has no tools.");
      },
      enableWebSearch: false,
      reasoningEffort: "low",
      maxOutputTokens: 700,
      maxToolRounds: 0,
      signal: AbortSignal.timeout(20_000),
    }
  );

  const draft = parsePolishedEmailResponse(
    response.content,
    subject || "A note from Leisure Life"
  );

  assertCustomEmailTextSafe("subject", draft.subject);
  assertCustomEmailTextSafe("message", draft.body);

  return { ...draft, model: response.model };
}
