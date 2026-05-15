import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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