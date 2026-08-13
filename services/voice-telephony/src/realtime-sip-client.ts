/**
 * OpenAI Realtime SIP call control.
 *
 * Endpoints (GA contract, verified August 13, 2026):
 *   POST /v1/realtime/calls/{call_id}/accept   - accept with session config
 *   POST /v1/realtime/calls/{call_id}/reject   - reject with a SIP status
 *   POST /v1/realtime/calls/{call_id}/refer    - transfer to a target URI
 *   POST /v1/realtime/calls/{call_id}/hangup   - end the call
 *   WSS  /v1/realtime?call_id={call_id}        - sideband monitoring/tools
 *
 * Truthfulness rule encoded here: every operation reports what the API
 * actually returned. A transfer is "requested" until the API accepts it, and
 * the agent is instructed never to claim otherwise.
 */

const API_BASE = "https://api.openai.com/v1/realtime/calls";

export interface AcceptCallConfig {
  model: string;
  instructions: string;
  voice: string;
  tools: unknown[];
}

export type CallOperationResult =
  | { ok: true; status: number }
  | { ok: false; status: number; reason: string };

export class RealtimeSipClient {
  constructor(private readonly apiKey: string) {}

  async acceptCall(callId: string, config: AcceptCallConfig): Promise<CallOperationResult> {
    return this.post(`${API_BASE}/${encodeURIComponent(callId)}/accept`, {
      type: "realtime",
      model: config.model,
      instructions: config.instructions,
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: { type: "semantic_vad", interrupt_response: true },
        },
        output: { voice: config.voice },
      },
      tools: config.tools,
      tool_choice: "auto",
    });
  }

  async rejectCall(callId: string, statusCode: number): Promise<CallOperationResult> {
    return this.post(`${API_BASE}/${encodeURIComponent(callId)}/reject`, {
      status_code: statusCode,
    });
  }

  /**
   * Requests a transfer. A successful HTTP result means the REQUEST was
   * accepted, which is what the agent may state. It is not proof the caller
   * reached a person.
   */
  async referCall(callId: string, targetUri: string): Promise<CallOperationResult> {
    return this.post(`${API_BASE}/${encodeURIComponent(callId)}/refer`, {
      target_uri: targetUri,
    });
  }

  async hangupCall(callId: string): Promise<CallOperationResult> {
    return this.post(`${API_BASE}/${encodeURIComponent(callId)}/hangup`, {});
  }

  sidebandUrl(callId: string): string {
    return `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;
  }

  authorizationHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async post(url: string, body: unknown): Promise<CallOperationResult> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          reason: `openai_call_api_${response.status}`,
        };
      }
      return { ok: true, status: response.status };
    } catch {
      return { ok: false, status: 0, reason: "network_error" };
    }
  }
}
