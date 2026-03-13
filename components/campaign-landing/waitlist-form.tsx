'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface CampaignWaitlistFormProps {
    campaignName: string;
    endpoint: string;
    enabled: boolean;
    defaultMode: 'GROUP_WAIT' | 'BOOK_NOW';
}

interface WaitlistResponse {
    success: boolean;
    error?: string;
    progress?: {
        joinedEntries: number;
        joinedPassengers: number;
        requiredCabins: number;
        percentOfThreshold: number;
    };
    nextStep?: {
        kind: 'wait_for_threshold' | 'booking_link_ready' | 'campaign_closed';
        title: string;
        detail: string;
        bookingLink: string | null;
    };
}

export function CampaignWaitlistForm({
    campaignName,
    endpoint,
    enabled,
    defaultMode,
}: CampaignWaitlistFormProps) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [passengerCount, setPassengerCount] = useState('2');
    const [preferredCabinType, setPreferredCabinType] = useState('Balcony');
    const [bookingMode, setBookingMode] = useState<'GROUP_WAIT' | 'BOOK_NOW'>(defaultMode);
    const [specialRequests, setSpecialRequests] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<WaitlistResponse | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    passengerCount: Number(passengerCount),
                    preferredCabinType,
                    specialRequests: specialRequests.trim() || undefined,
                    bookingMode,
                    caller: 'human',
                }),
            });

            const payload = (await response.json()) as WaitlistResponse;
            if (!response.ok || !payload.success) {
                setError(payload.error ?? 'The waitlist request failed.');
                setResult(null);
                return;
            }

            setResult(payload);
        } catch {
            setError('The waitlist request failed.');
            setResult(null);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
            <Card className="border-white/15 bg-slate-950/80 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
                <CardHeader>
                    <CardTitle className="text-2xl">Save Your Place</CardTitle>
                    <CardDescription className="text-slate-300">
                        Join {campaignName} through the path that matches how ready you are to move.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="grid gap-5" onSubmit={handleSubmit}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="firstName" className="text-slate-100">First name</Label>
                                <Input
                                    id="firstName"
                                    value={firstName}
                                    onChange={(event) => setFirstName(event.target.value)}
                                    className="border-white/15 bg-slate-900 text-slate-50"
                                    disabled={!enabled || submitting}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="lastName" className="text-slate-100">Last name</Label>
                                <Input
                                    id="lastName"
                                    value={lastName}
                                    onChange={(event) => setLastName(event.target.value)}
                                    className="border-white/15 bg-slate-900 text-slate-50"
                                    disabled={!enabled || submitting}
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="email" className="text-slate-100">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="border-white/15 bg-slate-900 text-slate-50"
                                    disabled={!enabled || submitting}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="passengerCount" className="text-slate-100">Passengers</Label>
                                <Input
                                    id="passengerCount"
                                    type="number"
                                    min={1}
                                    max={4}
                                    value={passengerCount}
                                    onChange={(event) => setPassengerCount(event.target.value)}
                                    className="border-white/15 bg-slate-900 text-slate-50"
                                    disabled={!enabled || submitting}
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label className="text-slate-100">Cabin preference</Label>
                                <Select value={preferredCabinType} onValueChange={setPreferredCabinType} disabled={!enabled || submitting}>
                                    <SelectTrigger className="border-white/15 bg-slate-900 text-slate-50">
                                        <SelectValue placeholder="Choose a cabin type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Inside">Inside</SelectItem>
                                        <SelectItem value="Oceanview">Oceanview</SelectItem>
                                        <SelectItem value="Balcony">Balcony</SelectItem>
                                        <SelectItem value="Suite">Suite</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-slate-100">Path</Label>
                                <Select value={bookingMode} onValueChange={(value) => setBookingMode(value as 'GROUP_WAIT' | 'BOOK_NOW')} disabled={!enabled || submitting}>
                                    <SelectTrigger className="border-white/15 bg-slate-900 text-slate-50">
                                        <SelectValue placeholder="Choose a path" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="GROUP_WAIT">Group wait</SelectItem>
                                        <SelectItem value="BOOK_NOW">Book now</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="specialRequests" className="text-slate-100">Special requests</Label>
                            <Input
                                id="specialRequests"
                                value={specialRequests}
                                onChange={(event) => setSpecialRequests(event.target.value)}
                                className="border-white/15 bg-slate-900 text-slate-50"
                                disabled={!enabled || submitting}
                                placeholder="Accessibility, room proximity, or other useful notes"
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Button type="submit" size="lg" className="bg-slate-50 text-slate-950 hover:bg-white" disabled={!enabled || submitting}>
                                {submitting ? 'Saving...' : 'Save interest'}
                            </Button>
                            <div className="rounded-lg border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
                                This stores your intent and returns the next step metadata for the current campaign state.
                            </div>
                        </div>

                        {error ? (
                            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                                {error}
                            </div>
                        ) : null}
                    </form>
                </CardContent>
            </Card>

            <Card className="border-white/15 bg-white/90 text-slate-950 shadow-[0_24px_80px_rgba(148,163,184,0.2)]">
                <CardHeader>
                    <CardTitle className="text-2xl">Next Step</CardTitle>
                    <CardDescription>
                        The endpoint returns a concrete next action instead of a bare success flag.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm text-slate-700">
                    {result?.nextStep ? (
                        <>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="font-semibold text-slate-950">{result.nextStep.title}</p>
                                <p className="mt-2">{result.nextStep.detail}</p>
                            </div>
                            {result.nextStep.bookingLink ? (
                                <Button asChild className="bg-slate-950 text-slate-50 hover:bg-slate-800">
                                    <a href={result.nextStep.bookingLink} target="_blank" rel="noreferrer">Open booking link</a>
                                </Button>
                            ) : null}
                            {result.progress ? (
                                <div className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                                    <p className="font-semibold text-slate-950">Progress snapshot</p>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Entries</p>
                                            <p className="text-lg font-semibold text-slate-950">{result.progress.joinedEntries}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Passengers</p>
                                            <p className="text-lg font-semibold text-slate-950">{result.progress.joinedPassengers}</p>
                                        </div>
                                    </div>
                                    <p>
                                        {result.progress.percentOfThreshold}% of the {result.progress.requiredCabins}-cabin threshold is currently represented by saved entries.
                                    </p>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                            Submit the form to see the exact campaign response for the current status and selected booking path.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}