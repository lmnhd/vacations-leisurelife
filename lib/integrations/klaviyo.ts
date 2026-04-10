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
    if (props.phoneNumber) attributes['phone_number'] = props.phoneNumber;

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
            try {
                const parsed = JSON.parse(body) as KlaviyoApiErrorResponse;
                const duplicateError = parsed.errors?.find((error) => error.code === 'duplicate_profile');
                const duplicateProfileId = duplicateError?.meta?.duplicate_profile_id;

                if (duplicateProfileId) {
                    return { profileId: duplicateProfileId };
                }
            } catch {
                // Fall through to the normal error below if the body is not JSON.
            }
        }

        throw new Error(`[Klaviyo] upsertProfile failed (${response.status}): ${body}`);
    }

    const json = (await response.json()) as { data: { id: string } };
    return { profileId: json.data.id };
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
