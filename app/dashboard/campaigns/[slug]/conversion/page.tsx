'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CampaignWaitlistEntry, CampaignLeadEvent } from '@/lib/campaigns/types';
import type { FunnelSummary, SourceBreakdownEntry } from '@/lib/campaigns/conversion-store';

// ─── API response shapes ───────────────────────────────────────────────────────

interface CampaignMeta {
    slug: string;
    name: string;
    status: string;
    minCabinsRequired: number;
}

interface LeadsResponse {
    success: boolean;
    campaign: CampaignMeta;
    funnel: FunnelSummary;
    leads: LeadDashboardRow[];
}

interface LeadDashboardRow extends CampaignWaitlistEntry {
    latestLifecycleStage: string | null;
    latestEventAt: string | null;
}

interface EventsResponse {
    success: boolean;
    campaignSlug: string;
    email: string | null;
    events: CampaignLeadEvent[];
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-2xl font-semibold text-slate-900">{value}</p>
            {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
        </div>
    );
}

function SourceTable({ rows }: { rows: SourceBreakdownEntry[] }) {
    if (rows.length === 0) {
        return <p className="text-sm text-slate-400 italic">No source data yet.</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-widest text-slate-500">
                        <th className="pb-2 pr-4">Channel</th>
                        <th className="pb-2 pr-4">Provider</th>
                        <th className="pb-2 pr-4">Draft Type</th>
                        <th className="pb-2 pr-4">Native ID</th>
                        <th className="pb-2 pr-4 text-right">Leads</th>
                        <th className="pb-2 text-right">Passengers</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={`${row.sourceChannel}::${row.provider}`} className="border-b border-slate-100 last:border-0">
                            <td className="py-2 pr-4 font-medium text-slate-800">{row.sourceChannel}</td>
                            <td className="py-2 pr-4 text-slate-600">{row.provider}</td>
                            <td className="py-2 pr-4 text-slate-600">{row.providerDraftType ?? '—'}</td>
                            <td className="py-2 pr-4 text-xs text-slate-500">{row.providerAdId ?? row.providerCampaignId ?? '—'}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
                            <td className="py-2 text-right tabular-nums">{row.passengers}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function lifecycleStageLabel(eventType: string): string {
    const labels: Record<string, string> = {
        waitlist_submitted: 'Waitlist submitted',
        provider_lead_ingested: 'Provider lead ingested',
        nurture_queued: 'Nurture queued',
        nurture_sent: 'Nurture sent',
        threshold_met: 'Threshold met',
        threshold_met_notified: 'Threshold notification sent',
        manifest_started: 'Manifest started',
        manifest_submitted: 'Manifest submitted',
        booking_link_sent: 'Booking link sent',
        converted: 'Converted',
        expired: 'Expired',
        lead_error: 'Error',
    };
    return labels[eventType] ?? eventType;
}

function EventTimeline({ events, loading }: { events: CampaignLeadEvent[]; loading: boolean }) {
    if (loading) {
        return <p className="text-sm text-slate-400">Loading events…</p>;
    }
    if (events.length === 0) {
        return <p className="text-sm text-slate-400 italic">No events recorded for this lead yet.</p>;
    }
    return (
        <ol className="relative border-l border-slate-200">
            {events.map((event) => (
                <li key={event.SK} className="mb-4 ml-4">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-slate-400" />
                    <p className="text-xs text-slate-400">{new Date(event.occurredAt).toLocaleString()}</p>
                    <p className="font-medium text-slate-800">{lifecycleStageLabel(event.eventType)}</p>
                    {event.attribution.sourceChannel ? (
                        <p className="text-xs text-slate-500">via {event.attribution.sourceChannel}</p>
                    ) : null}
                    {event.notes ? (
                        <p className="mt-0.5 text-xs text-slate-400">{event.notes}</p>
                    ) : null}
                </li>
            ))}
        </ol>
    );
}

function LeadRow({
    lead,
    selected,
    onSelect,
}: {
    lead: LeadDashboardRow;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <tr
            onClick={onSelect}
            className={`cursor-pointer border-b border-slate-100 last:border-0 transition-colors ${selected ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
        >
            <td className="py-2 pr-3 font-medium text-slate-800 whitespace-nowrap">
                {lead.firstName} {lead.lastName}
            </td>
            <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">{new Date(lead.createdAt).toLocaleDateString()}</td>
            <td className="py-2 pr-3 text-slate-600 text-xs">{lead.email}</td>
            <td className="py-2 pr-3 text-center tabular-nums">{lead.passengerCount}</td>
            <td className="py-2 pr-3">
                <Badge variant="outline" className="text-xs">
                    {lead.bookingMode === 'BOOK_NOW' ? 'Book Now' : 'Group Wait'}
                </Badge>
            </td>
            <td className="py-2 pr-3">
                <Badge variant={lead.manifestStatus === 'SUBMITTED' ? 'default' : 'outline'} className="text-xs">
                    {lead.manifestStatus ?? 'PENDING'}
                </Badge>
            </td>
            <td className="py-2 pr-3 text-center">
                {lead.converted ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-slate-400">—</span>}
            </td>
            <td className="py-2 pr-3 text-xs text-slate-600">{lead.latestLifecycleStage ? lifecycleStageLabel(lead.latestLifecycleStage) : 'No events yet'}</td>
            <td className="py-2 text-xs text-slate-500">
                {lead.attribution?.sourceChannel ?? lead.sourceChannel ?? 'direct'}
            </td>
        </tr>
    );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ConversionPage() {
    const { slug } = useParams<{ slug: string }>();

    const [leadsData, setLeadsData] = useState<LeadsResponse | null>(null);
    const [leadsError, setLeadsError] = useState<string | null>(null);
    const [leadsLoading, setLeadsLoading] = useState(true);

    const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
    const [leadEvents, setLeadEvents] = useState<CampaignLeadEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    const loadLeads = useCallback(async () => {
        setLeadsLoading(true);
        setLeadsError(null);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/leads`);
            const data = (await res.json()) as LeadsResponse;
            if (!res.ok || !data.success) {
                setLeadsError('Failed to load leads.');
            } else {
                setLeadsData(data);
            }
        } catch {
            setLeadsError('Failed to load leads.');
        } finally {
            setLeadsLoading(false);
        }
    }, [slug]);

    const loadLeadEvents = useCallback(async (email: string) => {
        setEventsLoading(true);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/events?email=${encodeURIComponent(email)}`);
            const data = (await res.json()) as EventsResponse;
            setLeadEvents(data.events ?? []);
        } catch {
            setLeadEvents([]);
        } finally {
            setEventsLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        void loadLeads();
    }, [loadLeads]);

    function handleSelectLead(email: string) {
        if (selectedEmail === email) {
            setSelectedEmail(null);
            setLeadEvents([]);
            return;
        }
        setSelectedEmail(email);
        void loadLeadEvents(email);
    }

    const funnel = leadsData?.funnel;
    const campaign = leadsData?.campaign;
    const leads = leadsData?.leads ?? [];
    const thresholdPct = campaign && funnel
        ? Math.min(100, Math.round((funnel.totalLeads / campaign.minCabinsRequired) * 100))
        : 0;

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Conversion Ops</h1>
                        {campaign ? (
                            <p className="text-sm text-slate-500 mt-0.5">
                                {campaign.name} · <span className="font-medium">{campaign.status}</span>
                            </p>
                        ) : null}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void loadLeads()}>
                        Refresh
                    </Button>
                </div>

                {leadsError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {leadsError}
                    </div>
                ) : null}

                {leadsLoading ? (
                    <div className="text-sm text-slate-400">Loading…</div>
                ) : null}

                {/* Section 1: Funnel Summary */}
                {funnel ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Funnel Summary</CardTitle>
                            <CardDescription>
                                Threshold: {funnel.totalLeads} of {campaign?.minCabinsRequired ?? '—'} cabins ({thresholdPct}%)
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                                <StatCard label="Total Leads" value={funnel.totalLeads} />
                                <StatCard label="Passengers" value={funnel.totalPassengers} />
                                <StatCard label="Threshold %" value={`${thresholdPct}%`} />
                                <StatCard label="Group Wait" value={funnel.groupWaitLeads} />
                                <StatCard label="Book Now" value={funnel.bookNowLeads} />
                                <StatCard label="Manifest In" value={funnel.manifestSubmittedLeads} />
                                <StatCard label="Notified" value={funnel.notifiedLeads} />
                                <StatCard label="Converted" value={funnel.convertedLeads} />
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                {/* Section 2: Source Breakdown */}
                {funnel ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Source Breakdown</CardTitle>
                            <CardDescription>Leads grouped by channel and provider</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SourceTable rows={funnel.sourceBreakdown} />
                        </CardContent>
                    </Card>
                ) : null}

                {/* Section 3 + 4: Lead Table + Detail Panel */}
                {!leadsLoading ? (
                    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Leads ({leads.length})</CardTitle>
                                <CardDescription>Click a row to view event timeline</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {leads.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic">No leads yet for this campaign.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-widest text-slate-500">
                                                    <th className="pb-2 pr-3">Name</th>
                                                    <th className="pb-2 pr-3">Created</th>
                                                    <th className="pb-2 pr-3">Email</th>
                                                    <th className="pb-2 pr-3 text-center">Pax</th>
                                                    <th className="pb-2 pr-3">Mode</th>
                                                    <th className="pb-2 pr-3">Manifest</th>
                                                    <th className="pb-2 pr-3 text-center">Conv.</th>
                                                    <th className="pb-2 pr-3">Stage</th>
                                                    <th className="pb-2">Source</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leads.map((lead) => (
                                                    <LeadRow
                                                        key={lead.email}
                                                        lead={lead}
                                                        selected={selectedEmail === lead.email}
                                                        onSelect={() => handleSelectLead(lead.email)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Event Timeline</CardTitle>
                                <CardDescription>
                                    {selectedEmail ? selectedEmail : 'Select a lead to view their lifecycle history'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {selectedEmail ? (
                                    <EventTimeline events={leadEvents} loading={eventsLoading} />
                                ) : (
                                    <p className="text-sm text-slate-400 italic">No lead selected.</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
