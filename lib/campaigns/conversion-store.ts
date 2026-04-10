import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import type { CampaignLeadEvent, CampaignWaitlistEntry, LeadAttribution, LeadEventType } from './types';

const TABLE_NAME = 'lll-shadow-campaigns';

export interface AppendLeadEventInput {
    campaignSlug: string;
    email: string;
    eventType: LeadEventType;
    attribution: LeadAttribution;
    notes?: string;
    metadata?: Record<string, string>;
}

export async function appendLeadEvent(input: AppendLeadEventInput): Promise<CampaignLeadEvent> {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();

    const event: CampaignLeadEvent = {
        PK: `CAMPAIGN#${input.campaignSlug}`,
        SK: `EVENT#${occurredAt}#${eventId}`,
        eventId,
        campaignSlug: input.campaignSlug,
        email: input.email.trim().toLowerCase(),
        eventType: input.eventType,
        occurredAt,
        attribution: input.attribution,
        notes: input.notes,
        metadata: input.metadata,
    };

    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: event,
    }));

    return event;
}

export async function listCampaignLeadEvents(slug: string): Promise<CampaignLeadEvent[]> {
    const response = await chatDynamoDocumentClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
            ':pk': `CAMPAIGN#${slug}`,
            ':prefix': 'EVENT#',
        },
        ScanIndexForward: true,
    }));

    return (response.Items as CampaignLeadEvent[] | undefined) ?? [];
}

export async function listLeadEvents(slug: string, email: string): Promise<CampaignLeadEvent[]> {
    const normalizedEmail = email.trim().toLowerCase();
    const all = await listCampaignLeadEvents(slug);
    return all.filter((event) => event.email === normalizedEmail);
}

export async function clearCampaignLeadEvents(slug: string): Promise<number> {
    const events = await listCampaignLeadEvents(slug);

    await Promise.all(events.map((event) =>
        chatDynamoDocumentClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: event.PK,
                SK: event.SK,
            },
        })),
    ));

    return events.length;
}

export interface FunnelSummary {
    totalLeads: number;
    totalPassengers: number;
    groupWaitLeads: number;
    bookNowLeads: number;
    manifestSubmittedLeads: number;
    bookingReadyLeads: number;
    convertedLeads: number;
    notifiedLeads: number;
    pendingLeads: number;
    sourceBreakdown: SourceBreakdownEntry[];
}

export interface SourceBreakdownEntry {
    sourceChannel: string;
    provider: string;
    providerDraftType?: string;
    providerCampaignId?: string;
    providerAdId?: string;
    count: number;
    passengers: number;
}

export function computeFunnelSummary(leads: CampaignWaitlistEntry[]): FunnelSummary {
    let totalPassengers = 0;
    let groupWaitLeads = 0;
    let bookNowLeads = 0;
    let manifestSubmittedLeads = 0;
    let bookingReadyLeads = 0;
    let convertedLeads = 0;
    let notifiedLeads = 0;

    const sourceMap = new Map<string, SourceBreakdownEntry>();

    for (const lead of leads) {
        totalPassengers += lead.passengerCount;

        if (lead.bookingMode === 'BOOK_NOW') {
            bookNowLeads += 1;
        } else {
            groupWaitLeads += 1;
        }

        if (lead.manifestStatus === 'SUBMITTED') {
            manifestSubmittedLeads += 1;
        }

        if (lead.notified) {
            notifiedLeads += 1;
            bookingReadyLeads += 1;
        }

        if (lead.converted) {
            convertedLeads += 1;
        }

        const channel = lead.attribution?.sourceChannel ?? lead.sourceChannel ?? 'direct';
        const provider = lead.attribution?.provider ?? 'direct';
        const providerDraftType = lead.attribution?.providerDraftType;
        const providerCampaignId = lead.attribution?.providerCampaignId;
        const providerAdId = lead.attribution?.providerAdId;
        const key = [channel, provider, providerDraftType ?? '', providerCampaignId ?? '', providerAdId ?? ''].join('::');
        const existing = sourceMap.get(key);
        if (existing) {
            existing.count += 1;
            existing.passengers += lead.passengerCount;
        } else {
            sourceMap.set(key, {
                sourceChannel: channel,
                provider,
                providerDraftType,
                providerCampaignId,
                providerAdId,
                count: 1,
                passengers: lead.passengerCount,
            });
        }
    }

    return {
        totalLeads: leads.length,
        totalPassengers,
        groupWaitLeads,
        bookNowLeads,
        manifestSubmittedLeads,
        bookingReadyLeads,
        convertedLeads,
        notifiedLeads,
        pendingLeads: leads.length - convertedLeads,
        sourceBreakdown: Array.from(sourceMap.values()).sort((a, b) => b.count - a.count),
    };
}
