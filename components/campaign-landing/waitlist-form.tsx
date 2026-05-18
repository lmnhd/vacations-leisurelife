'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, MailCheck, ShieldAlert } from 'lucide-react';
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
    /** Called after a successful signup with the persistent chat identity, pending email verification. */
    onGuestRegistered?: (identity: GuestIdentity) => void;
}

interface WaitlistResponse {
    success: boolean;
    error?: string;
    guestToken?: string;
    displayName?: string;
    confirmationEmail?: {
        sent: boolean;
        error?: string;
    };
    waitlist?: {
        emailVerified: boolean;
    };
    progress?: {
        joinedEntries: number;
        joinedPassengers: number;
        verifiedEntries: number;
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

export interface GuestIdentity {
    guestToken: string;
    displayName: string;
    emailVerified: boolean;
}

export function CampaignWaitlistForm({
    campaignName,
    endpoint,
    enabled,
    defaultMode,
    isGatheringInterest = false,
    onGuestRegistered,
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

    const isAwaitingVerification = result !== null && result.waitlist?.emailVerified !== true;
    const isVerified = result?.waitlist?.emailVerified === true;

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

            if (payload.guestToken && payload.displayName && onGuestRegistered) {
                onGuestRegistered({
                    guestToken: payload.guestToken,
                    displayName: payload.displayName,
                    emailVerified: payload.waitlist?.emailVerified ?? false,
                });
            }
        } catch {
            setError('We could not save your spot right now.');
            setResult(null);
        } finally {
            setSubmitting(false);
        }
    }

    const showInboxOverlay = isAwaitingVerification && Boolean(result?.nextStep);

    return (
        <div className="relative grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
            <Card className={`border-white/15 bg-slate-950/80 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.35)] ${showInboxOverlay ? 'lg:pointer-events-none lg:opacity-20 lg:blur-[1px]' : ''}`}>
                <CardHeader>
                    <CardTitle className="text-2xl">
                        {isGatheringInterest ? 'Join Free While This Cruise Forms' : 'Save Your Place In Line'}
                    </CardTitle>
                    <CardDescription className="text-slate-300">
                        {isGatheringInterest
                            ? 'This is a free, non-binding interest step. We use it to measure demand, connect potential guests, and decide whether this sailing should become a real group package.'
                            : 'Choose the path that matches your timing. No payment is taken on this page today.'}
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
                                        <SelectItem value="GROUP_WAIT">Join the list</SelectItem>
                                        <SelectItem value="BOOK_NOW">
                                            {isGatheringInterest ? 'Fastest booking handoff' : 'Book now'}
                                        </SelectItem>
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
                                This option does not promise an immediate confirmed booking. It tells us you want the earliest direct handoff if this sailing stabilizes. If the shared group version launches later, pricing, perks, or timing may differ.
                            </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            <Button type="submit" size="lg" className="bg-slate-50 text-slate-950 hover:bg-white" disabled={!enabled || submitting}>
                                {submitting ? 'Saving...' : isGatheringInterest ? 'Join free' : 'Save my spot'}
                            </Button>
                            <div className="px-4 py-3 text-sm border rounded-lg border-white/10 bg-slate-900/80 text-slate-300">
                                {isGatheringInterest
                                    ? 'No payment, reservation, or serious commitment is created here. We use your selection to send the right update as the campaign forms. SMS alerts are optional and only used when you provide a phone number and consent.'
                                    : 'We will use your selection to send the right next step for this sailing. SMS alerts are optional and only used when you provide a phone number and consent.'}
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

            <Card className={`border-white/15 shadow-[0_24px_80px_rgba(148,163,184,0.2)] ${isAwaitingVerification ? 'bg-slate-950 text-slate-50' : 'bg-white/90 text-slate-950'} ${showInboxOverlay ? 'lg:pointer-events-none lg:opacity-20 lg:blur-[1px]' : ''}`}>
                <CardHeader>
                    <CardTitle className="text-2xl">
                        {isAwaitingVerification ? 'Verify Your Email To Unlock Chat' : 'What Happens Next'}
                    </CardTitle>
                    <CardDescription className={isAwaitingVerification ? 'text-slate-300' : ''}>
                        {isAwaitingVerification
                            ? 'You have not joined the list yet. Your email must be verified before this entry counts and the next step unlocks.'
                            : isGatheringInterest
                                ? 'After you submit, this panel will explain how your interest is being held and what the next real step would be if the campaign matures.'
                                : 'After you submit, this panel will show the next step for the path you chose.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className={`grid gap-4 text-sm ${isAwaitingVerification ? 'text-slate-100' : 'text-slate-700'}`}>
                    {result?.nextStep ? (
                        <>
                            {isAwaitingVerification ? (
                                <div className="overflow-hidden rounded-2xl border border-sky-300/40 bg-slate-950 text-slate-50 shadow-[0_28px_80px_rgba(2,6,23,0.45)]">
                                    <div className="border-b border-white/10 bg-gradient-to-r from-sky-500/25 via-cyan-500/10 to-transparent px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-300/30 bg-sky-400/15 text-sky-100">
                                                <MailCheck className="h-5 w-5" />
                                            </span>
                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-200/80">Step 1 of 2</p>
                                                <p className="text-lg font-semibold text-white">Check your inbox</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid gap-4 px-5 py-5">
                                        {result.confirmationEmail?.sent === false ? (
                                            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">
                                                <div className="flex items-start gap-3">
                                                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" />
                                                    <div>
                                                        <p className="font-semibold text-rose-50">We could not send the verification email</p>
                                                        <p className="mt-1 text-sm leading-6 text-rose-100/90">
                                                            {result.confirmationEmail.error ?? 'The verification email did not go out. Please re-submit the form or contact support.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-sky-300/20 bg-white/[0.04] p-4 text-slate-100">
                                                <p className="font-semibold text-white">Your spot is saved, but you have not joined the list yet.</p>
                                                <p className="mt-1 text-sm leading-6 text-slate-200/90">
                                                    Click the confirmation link in your email to verify the address, join the list, and count this entry toward the threshold.
                                                </p>
                                            </div>
                                        )}

                                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-200/70">What this means</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-200/90">
                                                Until you verify, your submission is only saved as a pending request. Once you confirm the email, you join the list and the next step opens.
                                            </p>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-3">
                                            {[
                                                ['1', 'Open the email', 'Look for the waitlist confirmation message.'],
                                                ['2', 'Confirm the link', 'Tap the verification button inside the email.'],
                                                ['3', 'Join the list', 'Your email verifies and the next step becomes active.'],
                                            ].map(([step, title, detail]) => (
                                                <div key={step} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-200/80">Step {step}</p>
                                                    <p className="mt-2 font-semibold text-white">{title}</p>
                                                    <p className="mt-1 text-sm leading-6 text-slate-200/85">{detail}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className={`px-4 py-3 border rounded-lg ${isVerified ? 'border-emerald-200 bg-emerald-50' : result.confirmationEmail?.sent === false ? 'border-rose-200 bg-rose-50' : 'border-sky-200 bg-sky-50'}`}>
                                        <div className="flex items-start gap-3">
                                            <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isVerified ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'}`}>
                                                {isVerified ? <CheckCircle2 className="h-4 w-4" /> : <MailCheck className="h-4 w-4" />}
                                            </span>
                                            <div>
                                                <p className="font-semibold text-slate-950">{isVerified ? 'Email verified' : 'You have not joined the list yet'}</p>
                                                <p className="mt-1 text-sm leading-6 text-slate-700">
                                                    {isVerified
                                                        ? 'Your entry now counts toward the group threshold.'
                                                        : 'We sent a verification link to your email. Please click it to join the list before this entry counts toward the group threshold.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`px-4 py-3 border rounded-lg ${result.nextStep.kind === 'retail_booking_ready' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                                        <p className="font-semibold text-slate-950">{result.nextStep.title}</p>
                                        <p className="mt-2 leading-6 text-slate-700">{result.nextStep.detail}</p>
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
                                            <p className="leading-6 text-slate-700">
                                                {result.progress.percentOfThreshold}% of the {result.progress.requiredCabins}-cabin target is currently represented by saved cabin requests.
                                            </p>
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </>
                    ) : (
                        <div className="px-4 py-3 border rounded-lg border-slate-200 bg-slate-50">
                            {isGatheringInterest
                                ? 'Submit the form to see how this forming campaign will handle your path and what happens if the sailing becomes booking-ready.'
                                : 'Submit the form to see the next step for the current sailing state and the path you chose.'}
                        </div>
                    )}
                </CardContent>
            </Card>

            {showInboxOverlay ? (
                <div className="absolute inset-0 z-20">
                    <Card className="h-full border-sky-300/40 bg-slate-950/98 text-slate-50 shadow-[0_28px_100px_rgba(2,6,23,0.6)] backdrop-blur-md">
                        <CardHeader className="border-b border-white/10 bg-gradient-to-r from-sky-500/20 via-cyan-500/10 to-transparent">
                            <div className="flex items-center gap-3">
                                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-sky-300/30 bg-sky-400/15 text-sky-100">
                                    <MailCheck className="h-6 w-6" />
                                </span>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-200/80">Step 1 of 2</p>
                                    <CardTitle className="text-2xl text-white">Check your inbox</CardTitle>
                                    <CardDescription className="text-slate-300">
                                        Your submission is saved. We are waiting for the email verification step before the list opens.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="grid gap-5 p-6 lg:grid-cols-[1.05fr_0.95fr]">
                            <div className="grid gap-4">
                                {result.confirmationEmail?.sent === false ? (
                                    <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5 text-rose-100">
                                        <div className="flex items-start gap-3">
                                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" />
                                            <div>
                                                <p className="font-semibold text-rose-50">We could not send the verification email</p>
                                                <p className="mt-1 text-sm leading-6 text-rose-100/90">
                                                    {result.confirmationEmail.error ?? 'The verification email did not go out. Please re-submit the form or contact support.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-sky-300/20 bg-white/[0.04] p-5 text-slate-100">
                                        <p className="text-lg font-semibold text-white">Your spot is saved, but you have not joined the list yet.</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-200/90">
                                            Click the confirmation link in your email to verify the address, join the list, and count this entry toward the threshold.
                                        </p>
                                    </div>
                                )}

                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-200/70">What this means</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-200/90">
                                        Until you verify, your submission is only saved as a pending request. Once you confirm the email, you join the list and the next step opens.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4">
                                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
                                    {[
                                        ['1', 'Open the email', 'Look for the waitlist confirmation message.'],
                                        ['2', 'Confirm the link', 'Tap the verification button inside the email.'],
                                        ['3', 'Join the list', 'Your email verifies and the next step becomes active.'],
                                    ].map(([step, title, detail]) => (
                                        <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-200/80">Step {step}</p>
                                            <p className="mt-2 font-semibold text-white">{title}</p>
                                            <p className="mt-1 text-sm leading-6 text-slate-200/85">{detail}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 p-5 text-sm leading-6 text-sky-50">
                                    Once your email is verified, the next booking step will unlock automatically. Until then, this panel stays in front so you can focus on completing verification.
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
