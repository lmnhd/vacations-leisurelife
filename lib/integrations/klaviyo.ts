/**
 * Klaviyo REST API helper.
 *
 * Uses the Klaviyo API v2024-02-15 (fetch-based, no SDK dependency).
 * Required env vars:
 *   KLAVIYO_PRIVATE_API_KEY — server-side private key (pk_...)
 *
 * Prefer event-triggered flows over one-off template sends so campaign
 * teams can edit templates in Klaviyo without touching app code.
 */

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_VERSION = '2024-02-15';

function getApiKey(): string {
    const key = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
    if (!key) {
        throw new Error('[Klaviyo] KLAVIYO_PRIVATE_API_KEY is not configured.');
    }
    return key;
}

function klaviyoHeaders(apiKey: string): HeadersInit {
    return {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'revision': KLAVIYO_API_VERSION,
    };
}

/**
 * Normalize a phone number to E.164 (`+12345678901`) as Klaviyo requires. Returns
 * `null` if the input can't be cleaned into a valid shape — callers should
 * drop the field rather than send something Klaviyo will reject.
 *
 * Heuristics:
 *  - Strings starting with `+` keep the plus and digits only.
 *  - 10-digit strings are assumed US/CA and get `+1` prepended.
 *  - 11-digit strings starting with `1` get a `+` prepended.
 *  - Anything else (length 8-15 digits with a country code) is accepted as-is
 *    with a `+` prepended. Lengths outside 8-15 (E.164 spec) return null.
 */
export function normalizePhoneToE164(raw: string | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;

    if (hasPlus) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    // Bare international digits without a leading +. E.164 requires the +; if
    // we get here we have a plausible length but no clear country code, so we
    // best-effort prepend +.
    return `+${digits}`;
}

export interface KlaviyoProfileProperties {
    email: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    [key: string]: string | number | boolean | undefined;
}

export interface KlaviyoUpsertResult {
    profileId: string;
}

interface KlaviyoApiError {
    status?: number | string;
    code?: string;
    meta?: {
        duplicate_profile_id?: string;
    };
}

interface KlaviyoApiErrorResponse {
    errors?: KlaviyoApiError[];
}

type KlaviyoProfileAttributeValue =
    | string
    | number
    | boolean
    | Record<string, string | number | boolean>
    | undefined;

/**
 * Upsert a Klaviyo profile by email.
 * Returns the Klaviyo profile ID on success.
 */
export async function upsertKlaviyoProfile(
    props: KlaviyoProfileProperties,
): Promise<KlaviyoUpsertResult> {
    const apiKey = getApiKey();

    const attributes: Record<string, KlaviyoProfileAttributeValue> = {
        email: props.email,
    };
    const profileProperties: Record<string, string | number | boolean> = {};

    if (props.firstName) attributes['first_name'] = props.firstName;
    if (props.lastName) attributes['last_name'] = props.lastName;
    // Klaviyo PATCH validates phone_number against E.164 (+12345678901). The
    // POST endpoint was lenient on early profiles, but PATCH rejects anything
    // not in E.164 — and a single bad phone would block the email send for
    // that lead. Normalize defensively; drop the field if it can't be cleaned.
    if (props.phoneNumber) {
        const normalized = normalizePhoneToE164(props.phoneNumber);
        if (normalized) {
            attributes['phone_number'] = normalized;
        } else {
            console.warn(`[Klaviyo] Dropping unnormalizable phone "${props.phoneNumber}" for ${props.email}`);
        }
    }

    // Copy any extra properties into profile properties bag
    for (const [key, value] of Object.entries(props)) {
        if (!['email', 'firstName', 'lastName', 'phoneNumber'].includes(key) && value !== undefined) {
            profileProperties[key] = value;
        }
    }

    if (Object.keys(profileProperties).length > 0) {
        attributes['properties'] = profileProperties;
    }

    const response = await fetch(`${KLAVIYO_BASE}/profiles/`, {
        method: 'POST',
        headers: klaviyoHeaders(apiKey),
        body: JSON.stringify({
            data: {
                type: 'profile',
                attributes,
            },
        }),
    });

    if (!response.ok) {
        const body = await response.text();

        if (response.status === 409) {
            let duplicateProfileId: string | undefined;
            try {
                const parsed = JSON.parse(body) as KlaviyoApiErrorResponse;
                const duplicateError = parsed.errors?.find((error) => error.code === 'duplicate_profile');
                duplicateProfileId = duplicateError?.meta?.duplicate_profile_id;
            } catch {
                // Body isn't JSON — fall through to the throw below.
            }

            if (duplicateProfileId) {
                // CRITICAL: Klaviyo returns 409 on every repeat send. If we just
                // returned the id here (the old behavior) the profile would be
                // frozen at first-contact data forever — stale landing_page_url,
                // hero_image_url, sail_date, etc. PATCH the profile with the
                // current attributes so every dispatch refreshes the bag.
                // The PATCH call runs OUTSIDE the JSON-parse try so its errors
                // surface cleanly instead of being masked as the original 409.
                await patchKlaviyoProfile(apiKey, duplicateProfileId, attributes);
                return { profileId: duplicateProfileId };
            }
        }

        throw new Error(`[Klaviyo] upsertProfile failed (${response.status}): ${body}`);
    }

    const json = (await response.json()) as { data: { id: string } };
    return { profileId: json.data.id };
}

/**
 * Update an existing Klaviyo profile by id. Called from `upsertKlaviyoProfile`'s
 * duplicate-profile branch so subsequent sends refresh per-campaign properties
 * (landing_page_url, hero_image_url, sail_date, etc.) instead of letting the
 * profile rot at first-contact values.
 */
async function patchKlaviyoProfile(
    apiKey: string,
    profileId: string,
    attributes: Record<string, KlaviyoProfileAttributeValue>,
): Promise<void> {
    const response = await fetch(`${KLAVIYO_BASE}/profiles/${profileId}/`, {
        method: 'PATCH',
        headers: klaviyoHeaders(apiKey),
        body: JSON.stringify({
            data: {
                type: 'profile',
                id: profileId,
                attributes,
            },
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`[Klaviyo] patchProfile failed (${response.status}) for ${profileId}: ${body}`);
    }
}

export interface KlaviyoEventProperties {
    [key: string]: string | number | boolean | undefined;
}

export interface KlaviyoTrackEventInput {
    email: string;
    /** Klaviyo metric/event name. Must match a metric configured in the Klaviyo account. */
    eventName: string;
    properties?: KlaviyoEventProperties;
    occurredAt?: string;
}

export interface KlaviyoTrackResult {
    accepted: boolean;
    eventId?: string;
}

/**
 * Track a Klaviyo event for a profile (identified by email).
 * Events trigger Klaviyo flows configured in the Klaviyo dashboard.
 */
export async function trackKlaviyoEvent(
    input: KlaviyoTrackEventInput,
): Promise<KlaviyoTrackResult> {
    const apiKey = getApiKey();

    const body = {
        data: {
            type: 'event',
            attributes: {
                metric: {
                    data: {
                        type: 'metric',
                        attributes: { name: input.eventName },
                    },
                },
                profile: {
                    data: {
                        type: 'profile',
                        attributes: { email: input.email },
                    },
                },
                properties: input.properties ?? {},
                time: input.occurredAt ?? new Date().toISOString(),
            },
        },
    };

    const response = await fetch(`${KLAVIYO_BASE}/events/`, {
        method: 'POST',
        headers: klaviyoHeaders(apiKey),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`[Klaviyo] trackEvent "${input.eventName}" failed (${response.status}): ${text}`);
    }

    // Klaviyo returns 202 Accepted with no body on success
    return { accepted: true };
}
