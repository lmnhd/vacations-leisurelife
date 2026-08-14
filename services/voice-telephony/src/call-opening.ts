/**
 * Builds the explicit Realtime event that starts an inbound SIP call.
 * Accepting a call configures the session but does not make the model speak;
 * the sideband must send response.create after its WebSocket opens.
 */
export function buildCallOpeningResponse(text: string): Record<string, unknown> {
  return {
    type: "response.create",
    response: {
      instructions: `Say exactly this, then stop: ${text}`,
    },
  };
}
