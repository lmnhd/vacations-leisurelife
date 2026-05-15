import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createHmac, randomBytes } from 'crypto';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import type { CampaignWaitlistEntry, LeadAttribution } from './types';

const TABLE_NAME = 'lll-shadow-campaigns';

export interface CampaignWaitlistSummary {
    totalEntries: number;
    totalPassengers: number;
    convertedEntries: number;
    convertedPassengers: number;
    manifestSubmittedEntries: number;
    groupWaitEntries: number;
    bookNowEntries: number;
}

export interface UpsertCampaignWaitlistEntryInput {
    slug: string;
    email: string;
    firstName: string;
    lastName: string;
    passengerCount: number;
    preferredCabinType: string;
    specialRequests?: string;
    proposedEvents?: string;
    bookingMode: 'GROUP_WAIT' | 'BOOK_NOW';
    attribution?: LeadAttribution;
    sourceChannel?: string;
    /** Optional E.164-normalized phone number for SMS nurture. */
    phoneNumber?: string;
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

/**
 * HMAC-SHA256 token tied to the campaign + email. The secret is a random
 * nonce persisted on the entry itself so each signup gets a unique token
 * even for the same email + slug combination (resends generate new tokens).
 */
function generateVerificationToken(slug: string, email: string): { token: string; nonce: string } {
    const nonce = randomBytes(16).toString('hex');
    const token = createHmac('sha256', nonce)
        .update(`${slug}:${email}`)
        .digest('hex');
    return { token, nonce };
}

function createEmptySummary(): CampaignWaitlistSummary {
    return {
        totalEntries: 0,
        totalPassengers: 0,
        convertedEntries: 0,
        convertedPassengers: 0,
        manifestSubmittedEntries: 0,
        groupWaitEntries: 0,
        bookNowEntries: 0,
    };
}

export async function getCampaignWaitlistEntry(
    slug: string,
    email: string,
): Promise<CampaignWaitlistEntry | null> {
    const normalizedEmail = normalizeEmail(email);
    const response = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `CAMPAIGN#${slug}`,
            SK: `USER#${normalizedEmail}`,
        },
    }));

    return (response.Item as CampaignWaitlistEntry) ?? null;
}

export async function upsertCampaignWaitlistEntry(
    input: UpsertCampaignWaitlistEntryInput,
): Promise<CampaignWaitlistEntry> {
    const normalizedEmail = normalizeEmail(input.email);
    const existing = await getCampaignWaitlistEntry(input.slug, normalizedEmail);
    const now = new Date().toISOString();

    const { token, nonce } = generateVerificationToken(input.slug, normalizedEmail);

    const entry: CampaignWaitlistEntry = {
        PK: `CAMPAIGN#${input.slug}`,
        SK: `USER#${normalizedEmail}`,
        email: normalizedEmail,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        passengerCount: input.passengerCount,
        preferredCabinType: input.preferredCabinType.trim(),
        specialRequests: input.specialRequests?.trim() || undefined,
        proposedEvents: input.proposedEvents?.trim() || undefined,
        bookingMode: input.bookingMode,
        fulfillmentMode: existing?.fulfillmentMode ?? 'AUTO',
        manifestStatus: existing?.manifestStatus ?? 'PENDING',
        emailVerified: existing?.emailVerified ?? false,
        verificationToken: existing?.emailVerified ? undefined : token,
        notified: existing?.notified ?? false,
        converted: existing?.converted ?? false,
        attribution: input.attribution ?? existing?.attribution,
        sourceChannel: input.sourceChannel ?? input.attribution?.sourceChannel ?? existing?.sourceChannel,
        phoneNumber: input.phoneNumber ?? existing?.phoneNumber,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: entry,
    }));

    return entry;
}

export interface MarkLeadAsBookedInput {
    slug: string;
    email: string;
    bookingReference: string;
    bookingConfirmedAt: string;
    bookingAmount?: number;
    bookingNotes?: string;
    bookingEnteredBy?: string;
}

export interface MarkLeadAsBookedResult {
    entry: CampaignWaitlistEntry;
    /** True when this call flipped `converted` from false → true (first reconciliation). */
    convertedNow: boolean;
}

/**
 * Manual booking reconciliation. Sets `converted=true`, `notified=true`, and
 * stamps the booking-reference metadata. Idempotent — calling twice with the
 * same lead updates the metadata but only reports `convertedNow=true` on the
 * initial flip so the caller can decide whether to write a ledger event /
 * fire the booking-confirmed email exactly once.
 */
export async function markLeadAsBooked(
    input: MarkLeadAsBookedInput,
): Promise<MarkLeadAsBookedResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const existing = await getCampaignWaitlistEntry(input.slug, normalizedEmail);
    if (!existing) {
        throw new Error(`[WaitlistStore] Lead not found for booking: ${normalizedEmail} in ${input.slug}`);
    }

    const wasConverted = existing.converted === true;
    const now = new Date().toISOString();

    const entry: CampaignWaitlistEntry = {
        ...existing,
        converted: true,
        notified: true,
        bookingReference: input.bookingReference.trim(),
        bookingConfirmedAt: input.bookingConfirmedAt,
        bookingAmount: input.bookingAmount,
        bookingNotes: input.bookingNotes?.trim() || undefined,
        bookingEnteredBy: input.bookingEnteredBy?.trim() || undefined,
        updatedAt: now,
    };

    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: entry,
    }));

    return { entry, convertedNow: !wasConverted };
}

export async function listCampaignWaitlistEntries(slug: string): Promise<CampaignWaitlistEntry[]> {
    const response = await chatDynamoDocumentClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :userPrefix)',
        ExpressionAttributeValues: {
            ':pk': `CAMPAIGN#${slug}`,
            ':userPrefix': 'USER#',
        },
    }));

    return (response.Items as CampaignWaitlistEntry[] | undefined) ?? [];
}

export async function clearCampaignWaitlistEntries(slug: string): Promise<number> {
    const entries = await listCampaignWaitlistEntries(slug);

    await Promise.all(entries.map((entry) =>
        chatDynamoDocumentClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: entry.PK,
                SK: entry.SK,
            },
        })),
    ));

    return entries.length;
}

export async function getCampaignWaitlistSummary(slug: string): Promise<CampaignWaitlistSummary> {
    const entries = await listCampaignWaitlistEntries(slug);

    return entries.reduce<CampaignWaitlistSummary>((summary, entry) => {
        summary.totalEntries += 1;
        summary.totalPassengers += entry.passengerCount;

        if (entry.converted) {
            summary.convertedEntries += 1;
            summary.convertedPassengers += entry.passengerCount;
        }

        if (entry.manifestStatus === 'SUBMITTED') {
            summary.manifestSubmittedEntries += 1;
        }

        if (entry.bookingMode === 'BOOK_NOW') {
            summary.bookNowEntries += 1;
        } else {
            summary.groupWaitEntries += 1;
        }

        return summary;
    }, createEmptySummary());
}

// ─── Email Verification ───────────────────────────────────────────────────────

export interface VerifyWaitlistEmailResult {
    verified: boolean;
    alreadyVerified: boolean;
    entry: CampaignWaitlistEntry;
}

/**
 * Consume the verification token sent in the waitlist confirmation email.
 * Sets `emailVerified = true` and clears the one-time token.
 *
 * Returns `{ verified: true }` on success.
 * Returns `{ alreadyVerified: true }` if already verified (idempotent).
 * Throws if the entry or token is missing / mismatched.
 */
export async function verifyWaitlistEmail(
    slug: string,
    email: string,
    token: string,
): Promise<VerifyWaitlistEmailResult> {
    const normalizedEmail = normalizeEmail(email);
    const existing = await getCampaignWaitlistEntry(slug, normalizedEmail);

    if (!existing) {
        throw new Error(`[WaitlistStore] Entry not found: ${normalizedEmail} in ${slug}`);
    }

    if (existing.emailVerified) {
        return { verified: true, alreadyVerified: true, entry: existing };
    }

    if (!existing.verificationToken || existing.verificationToken !== token) {
        throw new Error('[WaitlistStore] Invalid or expired verification token.');
    }

    const updated: CampaignWaitlistEntry = {
        ...existing,
        emailVerified: true,
        verificationToken: undefined,
        updatedAt: new Date().toISOString(),
    };

    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: updated,
    }));

    return { verified: true, alreadyVerified: false, entry: updated };
}

/**
 * Identical to `getCampaignWaitlistSummary` but only counts entries where
 * `emailVerified === true`. This is the summary used for threshold checks
 * so unverified burner-email entries are excluded from the cabin count.
 */
export async function getVerifiedWaitlistSummary(slug: string): Promise<CampaignWaitlistSummary> {
    const entries = await listCampaignWaitlistEntries(slug);
    const verified = entries.filter((e) => e.emailVerified === true);

    return verified.reduce<CampaignWaitlistSummary>((summary, entry) => {
        summary.totalEntries += 1;
        summary.totalPassengers += entry.passengerCount;

        if (entry.converted) {
            summary.convertedEntries += 1;
            summary.convertedPassengers += entry.passengerCount;
        }

        if (entry.manifestStatus === 'SUBMITTED') {
            summary.manifestSubmittedEntries += 1;
        }

        if (entry.bookingMode === 'BOOK_NOW') {
            summary.bookNowEntries += 1;
        } else {
            summary.groupWaitEntries += 1;
        }

        return summary;
    }, createEmptySummary());
}