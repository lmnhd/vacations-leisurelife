'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { VisualFlavor } from '@/lib/campaigns/schema';
import { Button } from '@/components/ui/button';

interface FlavorAuditionToolbarProps {
    slug: string;
    /** The flavor that the public route will render right now (i.e. campaign.manualVisualFlavor || auto). */
    persistedFlavor: VisualFlavor;
    /** True when `campaign.manualVisualFlavor` is set (vs. auto-derived from energy mode). */
    persistedIsLocked: boolean;
}

interface FlavorOption {
    flavor: VisualFlavor;
    label: string;
    sublabel: string;
}

const FLAVOR_OPTIONS: FlavorOption[] = [
    { flavor: 'editorial_magazine', label: 'Editorial', sublabel: 'System 1 · Magazine' },
    { flavor: 'travel_nostalgia', label: 'Nostalgia', sublabel: 'System 2 · Postcard' },
    { flavor: 'indie_zine', label: 'Zine', sublabel: 'System 3 · Polaroid' },
    { flavor: 'none', label: 'Modular', sublabel: 'System 4 · Brand' },
];

export function FlavorAuditionToolbar({ slug, persistedFlavor, persistedIsLocked }: FlavorAuditionToolbarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [savingFlavor, setSavingFlavor] = useState<VisualFlavor | null>(null);
    const [clearing, setClearing] = useState(false);

    const overrideParam = searchParams.get('flavor');
    const activeFlavor: VisualFlavor = useMemo(() => {
        if (
            overrideParam === 'editorial_magazine'
            || overrideParam === 'travel_nostalgia'
            || overrideParam === 'indie_zine'
            || overrideParam === 'none'
        ) {
            return overrideParam;
        }
        return persistedFlavor;
    }, [overrideParam, persistedFlavor]);

    const isAuditioning = overrideParam !== null && overrideParam !== persistedFlavor;

    const updateUrl = useCallback((flavor: VisualFlavor) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set('flavor', flavor);
        startTransition(() => {
            router.replace(`?${next.toString()}`);
            router.refresh();
        });
    }, [router, searchParams]);

    const clearAudition = useCallback(() => {
        const next = new URLSearchParams(searchParams.toString());
        next.delete('flavor');
        startTransition(() => {
            router.replace(next.toString() ? `?${next.toString()}` : '?');
            router.refresh();
        });
    }, [router, searchParams]);

    async function lockFlavor(flavor: VisualFlavor) {
        setSavingFlavor(flavor);
        setStatusMessage('');
        try {
            const response = await fetch(`/api/groups/campaign/${slug}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manualVisualFlavor: flavor }),
            });
            const data = await response.json() as { message?: string; error?: string };
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to lock flavor.');
            }
            setStatusMessage(`✓ Locked "${flavor}" as the campaign's visual flavor.`);
            startTransition(() => {
                router.refresh();
            });
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Failed to lock flavor.');
        } finally {
            setSavingFlavor(null);
        }
    }

    async function clearLockedFlavor() {
        setClearing(true);
        setStatusMessage('');
        try {
            const response = await fetch(`/api/groups/campaign/${slug}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manualVisualFlavor: null }),
            });
            const data = await response.json() as { message?: string; error?: string };
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to clear locked flavor.');
            }
            setStatusMessage('✓ Cleared lock — reverting to auto-selection from energy mode.');
            startTransition(() => {
                router.refresh();
            });
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Failed to clear lock.');
        } finally {
            setClearing(false);
        }
    }

    // Clear status messages after 6 seconds.
    useEffect(() => {
        if (!statusMessage) return;
        const timer = window.setTimeout(() => setStatusMessage(''), 6000);
        return () => window.clearTimeout(timer);
    }, [statusMessage]);

    return (
        <div className="border-y border-indigo-300 bg-indigo-50 px-4 py-3 text-indigo-950 md:px-6">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-900">Visual Flavor Audition</p>
                        <p className="text-sm text-indigo-950">
                            Active: <span className="font-semibold">{activeFlavor}</span>
                            {isAuditioning && <span className="ml-2 rounded bg-indigo-200 px-2 py-0.5 text-xs font-bold">PREVIEW · not saved</span>}
                            {!isAuditioning && persistedIsLocked && <span className="ml-2 rounded bg-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-950">LOCKED</span>}
                            {!isAuditioning && !persistedIsLocked && <span className="ml-2 rounded bg-stone-200 px-2 py-0.5 text-xs font-bold">AUTO</span>}
                        </p>
                    </div>
                    <p className="max-w-md text-xs text-indigo-800">
                        Click a system to preview. Lock writes the choice to the campaign so the public route honors it.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {FLAVOR_OPTIONS.map((option) => {
                        const isActive = activeFlavor === option.flavor;
                        return (
                            <Button
                                key={option.flavor}
                                type="button"
                                variant={isActive ? 'default' : 'outline'}
                                disabled={isPending}
                                className={isActive ? 'bg-indigo-700 text-white hover:bg-indigo-800' : 'border-indigo-300 bg-white'}
                                onClick={() => updateUrl(option.flavor)}
                            >
                                <span className="flex flex-col items-start text-left">
                                    <span className="text-sm font-bold leading-tight">{option.label}</span>
                                    <span className="text-[10px] font-medium opacity-75">{option.sublabel}</span>
                                </span>
                            </Button>
                        );
                    })}

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="default"
                            className="bg-emerald-700 text-white hover:bg-emerald-800"
                            disabled={savingFlavor !== null || activeFlavor === persistedFlavor && persistedIsLocked}
                            onClick={() => lockFlavor(activeFlavor)}
                        >
                            {savingFlavor === activeFlavor ? 'Locking...' : `Lock ${activeFlavor}`}
                        </Button>
                        {persistedIsLocked && (
                            <Button
                                type="button"
                                variant="outline"
                                className="border-rose-300 bg-white text-rose-700"
                                disabled={clearing}
                                onClick={clearLockedFlavor}
                            >
                                {clearing ? 'Clearing...' : 'Clear lock (auto)'}
                            </Button>
                        )}
                        {isAuditioning && (
                            <Button
                                type="button"
                                variant="outline"
                                className="border-indigo-300 bg-white"
                                disabled={isPending}
                                onClick={clearAudition}
                            >
                                Reset preview
                            </Button>
                        )}
                    </div>
                </div>

                {statusMessage && (
                    <p className="rounded border border-indigo-300 bg-white px-3 py-2 text-sm text-indigo-950">{statusMessage}</p>
                )}
            </div>
        </div>
    );
}
