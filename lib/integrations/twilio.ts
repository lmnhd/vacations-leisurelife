/**
 * Twilio Messages API helper.
 *
 * Uses the Twilio REST API directly (fetch-based, no SDK dependency).
 * Required env vars:
 *   TWILIO_ACCOUNT_SID  — account SID (AC...)
 *   TWILIO_AUTH_TOKEN   — auth token
 *   TWILIO_FROM_NUMBER  — E.164 sender number or messaging service SID
 *
 * SMS is only sent when a valid phone number is available.
 * Callers must gate on phone number presence before calling sendSms.
 */

function getCredentials(): { accountSid: string; authToken: string; fromNumber: string } {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

    if (!accountSid) throw new Error('[Twilio] TWILIO_ACCOUNT_SID is not configured.');
    if (!authToken) throw new Error('[Twilio] TWILIO_AUTH_TOKEN is not configured.');
    if (!fromNumber) throw new Error('[Twilio] TWILIO_FROM_NUMBER is not configured.');

    return { accountSid, authToken, fromNumber };
}

/**
 * Normalize a phone number to E.164 format for Twilio.
 * Strips spaces, dashes, parens. Prepends +1 for 10-digit US numbers if no country code.
 * Returns null if the result is clearly not a valid E.164 number.
 */
export function normalizeToE164(raw: string): string | null {
    const stripped = raw.replace(/[\s\-().]/g, '');

    // Already E.164
    if (/^\+\d{7,15}$/.test(stripped)) {
        return stripped;
    }

    // 10-digit US number without country code
    if (/^\d{10}$/.test(stripped)) {
        return `+1${stripped}`;
    }

    // 11-digit starting with 1 (US)
    if (/^1\d{10}$/.test(stripped)) {
        return `+${stripped}`;
    }

    return null;
}

export interface TwilioSendInput {
    to: string;
    body: string;
}

export interface TwilioSendResult {
    sent: true;
    messageSid: string;
    to: string;
}

export interface TwilioSkipResult {
    sent: false;
    reason: 'invalid_phone' | 'missing_phone';
}

/**
 * Send an SMS via Twilio.
 *
 * Returns a skip result (not a throw) when the phone number is absent or invalid,
 * so callers can record a truthful skip event rather than an error.
 * Throws on actual Twilio API failures.
 */
export async function sendSms(
    input: TwilioSendInput,
): Promise<TwilioSendResult | TwilioSkipResult> {
    if (!input.to || input.to.trim() === '') {
        return { sent: false, reason: 'missing_phone' };
    }

    const normalized = normalizeToE164(input.to);
    if (!normalized) {
        return { sent: false, reason: 'invalid_phone' };
    }

    const { accountSid, authToken, fromNumber } = getCredentials();

    const params = new URLSearchParams({
        To: normalized,
        From: fromNumber,
        Body: input.body,
    });

    const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        },
    );

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`[Twilio] sendSms failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { sid: string; to: string };
    return { sent: true, messageSid: json.sid, to: json.to };
}
