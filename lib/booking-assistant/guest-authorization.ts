import { parseGuestSessionCookieValue } from "./resume-tokens";

export function requireGuestDraftSession(
  cookieValue: string | undefined,
  draftId: string
): { draftId: string; personId: string } {
  if (!cookieValue) throw new Error("Guest session is required");
  const session = parseGuestSessionCookieValue(cookieValue);
  if (!session || session.draftId !== draftId) {
    throw new Error("Guest session is not authorized for this draft");
  }
  return { draftId: session.draftId, personId: session.personId };
}
