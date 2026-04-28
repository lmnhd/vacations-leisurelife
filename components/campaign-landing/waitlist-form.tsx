'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
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

interface FirstPartyAttribution {
    landingPath: string;
    referrer: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string;
}

function captureFirstPartyAttribution(): FirstPartyAttribution {
    const params = new URLSearchParams(window.location.search);
    return {
        landingPath: window.location.pathname,
        referrer: document.referrer,
        utmSource: params.get('utm_source') ?? '',
        utmMedium: params.get('utm_medium') ?? '',
        utmCampaign: params.get('utm_campaign') ?? '',
        utmContent: params.get('utm_content') ?? '',
        utmTerm: params.get('utm_term') ?? '',
    };
}

interface CampaignWaitlistFormProps {
    campaignName: string;
    endpoint: string;
    enabled: boolean;
    defaultMode: 'GROUP_WAIT' | 'BOOK_NOW';
    isGatheringInterest?: boolean;
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
        kind: 'wait_for_threshold' | 'booking_link_ready' | 'retail_booking_ready' | 'campaign_closed';
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
    isGatheringInterest = false,
}: CampaignWaitlistFormProps) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [smsConsent, setSmsConsent] = useState(false);
    const [passengerCount, setPassengerCount] = useState('2');
    const [preferredCabinType, setPreferredCabinType] = useState('Balcony');
    const [bookingMode, setBookingMode] = useState<'GROUP_WAIT' | 'BOOK_NOW'>(defaultMode);
    const [specialRequests, setSpecialRequests] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<WaitlistResponse | null>(null);
    const attributionRef = useRef<FirstPartyAttribution | null>(null);

    useEffect(() => {
        attributionRef.current = captureFirstPartyAttribution();
    }, []);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (phoneNumber.trim() && !smsConsent) {
            setError('Please confirm SMS consent before saving a phone number for threshold alerts.');
            setResult(null);
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const attribution = attributionRef.current ?? captureFirstPartyAttribution();
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    phoneNumber: phoneNumber.trim() || undefined,
                    smsConsent: phoneNumber.trim() ? smsConsent : undefined,
                    passengerCount: Number(passengerCount),
                    preferredCabinType,
                    specialRequests: specialRequests.trim() || undefined,
                    bookingMode,
                    caller: 'human',
                    attribution: {
                        // sourceChannel intentionally omitted — server normalizes from UTM/referrer
                        landingPath: attribution.landingPath || undefined,
                        referrer: attribution.referrer || undefined,
                        utmSource: attribution.utmSource || undefined,
                        utmMedium: attribution.utmMedium || undefined,
                        utmCampaign: attribution.utmCampaign || undefined,
                        utmContent: attribution.utmContent || undefined,
                        utmTerm: attribution.utmTerm || undefined,
                    },
                }),
            });

            const payload = (await response.json()) as WaitlistResponse;
            if (!response.ok || !payload.success) {
                setError(payload.error ?? 'We could not save your spot right now.');
                setResult(null);
                return;
            }

            setResult(payload);
        } catch {
            setError('We could not save your spot right now.');
            setResult(null);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
            <Card className="border-white/15 bg-slate-950/80 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
                <CardHeader>
                    <CardTitle className="text-2xl">Save Your Place In Line</CardTitle>
                    <CardDescription className="text-slate-300">
                        Choose the path that matches your timing. No payment is taken on this page today.
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

                        <div className="grid gap-2">
                            <Label htmlFor="phoneNumber" className="text-slate-100">
                                Phone <span className="text-slate-400 font-normal">(optional — for threshold text alerts)</span>
                            </Label>
                            <Input
                                id="phoneNumber"
                                type="tel"
                                value={phoneNumber}
                                onChange={(event) => setPhoneNumber(event.target.value)}
                                className="border-white/15 bg-slate-900 text-slate-50"
                                disabled={!enabled || submitting}
                                placeholder="+1 555 000 0000"
                            />
                        </div>

                        <label className="grid gap-3 rounded-lg border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
                            <span className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={smsConsent}
                                    onChange={(event) => setSmsConsent(event.target.checked)}
                                    disabled={!enabled || submitting || !phoneNumber.trim()}
                                    className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950"
                                />
                                <span>
                                    By providing a mobile number, you agree to receive variable informational SMS alerts from Leisure Life Interactive about this selected cruise campaign, including threshold and next-step updates. Message and data rates may apply. Reply STOP to opt out and HELP for help.
                                </span>
                            </span>
                            <span>
                                See our <Link href="/privacy" className="underline underline-offset-4 hover:text-white">Privacy Policy</Link> and <Link href="/terms" className="underline underline-offset-4 hover:text-white">Terms of Service</Link>.
                            </span>
                        </label>

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
                                        <SelectItem value="GROUP_WAIT">Join the group list</SelectItem>
                                        <SelectItem value="BOOK_NOW">I want the early booking path</SelectItem>
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

                        {isGatheringInterest && bookingMode === 'BOOK_NOW' && (
                            <div className="px-4 py-3 text-sm border rounded-lg border-amber-400/30 bg-amber-500/10 text-amber-100">
                                Booking independently now means you will secure your cabin immediately, but you may forfeit group-specific pricing and amenities. To guarantee the group experience, choose &ldquo;Join the group list&rdquo; instead.
                            </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            <Button type="submit" size="lg" className="bg-slate-50 text-slate-950 hover:bg-white" disabled={!enabled || submitting}>
                                {submitting ? 'Saving...' : 'Save my spot'}
                            </Button>
                            <div className="px-4 py-3 text-sm border rounded-lg border-white/10 bg-slate-900/80 text-slate-300">
                                We will use your selection to send the right next step for this sailing. SMS alerts are optional and only used when you provide a phone number and consent.
                            </div>
                        </div>

                        {error ? (
                            <div className="px-4 py-3 text-sm border rounded-lg border-rose-400/30 bg-rose-500/10 text-rose-100">
                                {error}
                            </div>
                        ) : null}
                    </form>
                </CardContent>
            </Card>

            <Card className="border-white/15 bg-white/90 text-slate-950 shadow-[0_24px_80px_rgba(148,163,184,0.2)]">
                <CardHeader>
                    <CardTitle className="text-2xl">What Happens Next</CardTitle>
                    <CardDescription>
                        After you submit, this panel will show the next step for the path you chose.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm text-slate-700">
                    {result?.nextStep ? (
                        <>
                            <div className={`px-4 py-3 border rounded-lg ${result.nextStep.kind === 'retail_booking_ready' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                                <p className="font-semibold text-slate-950">{result.nextStep.title}</p>
                                <p className="mt-2">{result.nextStep.detail}</p>
                            </div>
                            {result.nextStep.bookingLink ? (
                                <Button asChild className={result.nextStep.kind === 'retail_booking_ready' ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-slate-950 text-slate-50 hover:bg-slate-800'}>
                                    <a href={result.nextStep.bookingLink} target="_blank" rel="noreferrer">Open booking link</a>
                                </Button>
                            ) : null}
                            {result.progress ? (
                                <div className="grid gap-3 px-4 py-3 bg-white border rounded-lg border-slate-200">
                                    <p className="font-semibold text-slate-950">Current pulse</p>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cabin Requests</p>
                                            <p className="text-lg font-semibold text-slate-950">{result.progress.joinedEntries}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">People on the waitlist</p>
                                            <p className="text-lg font-semibold text-slate-950">{result.progress.joinedPassengers}</p>
                                        </div>
                                    </div>
                                    <p>
                                        {result.progress.percentOfThreshold}% of the {result.progress.requiredCabins}-cabin target is currently represented by saved cabin requests.
                                    </p>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="px-4 py-3 border rounded-lg border-slate-200 bg-slate-50">
                            Submit the form to see the next step for the current sailing state and the path you chose.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}