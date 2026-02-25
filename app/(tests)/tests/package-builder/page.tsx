'use client';

import { useState } from 'react';
import { PackageCard } from '@/components/chat/PackageCard';
import { PackageBuilderOutput } from '@/lib/chat/types';

const DEFAULT_PAYLOAD = JSON.stringify(
    {
        packages: [
            {
                cruiseDetails: {
                    odysseusItineraryCode: 'CARN-12345',
                    shipName: 'Carnival Celebration',
                    sailDate: '06/14/2025',
                    durationNights: 7,
                    departurePort: 'Miami, FL',
                    baseFarePerPerson: 899,
                    taxesAndFeesPerPerson: 142,
                },
                guests: { count: 2, ages: [42, 38] },
                gratuityPerPerson: 126,
                includedExcursions: [
                    { excursionId: 'EX-001', label: 'Nassau Snorkel & Beach Break', pricePerPerson: 89 },
                ],
                appliedPerkCodes: ['OBC50', 'FREE_GRATS'],
                depositTier: 'standard',
            },
            {
                cruiseDetails: {
                    odysseusItineraryCode: 'RCCL-67890',
                    shipName: 'Wonder of the Seas',
                    sailDate: '06/21/2025',
                    durationNights: 7,
                    departurePort: 'Port Canaveral, FL',
                    baseFarePerPerson: 1149,
                    taxesAndFeesPerPerson: 168,
                },
                guests: { count: 2, ages: [42, 38] },
                gratuityPerPerson: 0,
                includedExcursions: [],
                appliedPerkCodes: ['OBC100', 'UPGRADE_GUARANTEE'],
                depositTier: 'promo',
            },
        ],
    },
    null,
    2
);

export default function PackageBuilderTestPage() {
    const [payload, setPayload] = useState<string>(DEFAULT_PAYLOAD);
    const [result, setResult] = useState<PackageBuilderOutput | null>(null);
    const [rawJson, setRawJson] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);

    async function handleBuild() {
        setError('');
        setResult(null);
        setRawJson('');
        setLoading(true);

        try {
            const parsed: unknown = JSON.parse(payload);
            const response = await fetch('/api/tests/package-builder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsed),
            });

            const data: unknown = await response.json();

            if (!response.ok) {
                const errData = data as { error?: string };
                setError(errData.error ?? `HTTP ${response.status}`);
                return;
            }

            const outputData = data as PackageBuilderOutput;
            setResult(outputData);
            setRawJson(JSON.stringify(outputData, null, 2));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-white">Package Builder — Test Harness</h1>
                    <p className="text-zinc-400 mt-1 text-sm">
                        Paste a valid <code className="text-sky-400">PackageBuilderBatchInput</code> payload,
                        then click Build to preview the rendered <code className="text-sky-400">PackageCard</code>.
                    </p>
                </div>

                {/* Input + Controls */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <label className="text-xs uppercase tracking-widest text-zinc-400 font-medium">
                            Input JSON Payload
                        </label>
                        <textarea
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                            rows={28}
                            spellCheck={false}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-sm font-mono text-zinc-200 focus:outline-none focus:border-sky-500 resize-none"
                        />
                        <button
                            onClick={handleBuild}
                            disabled={loading}
                            className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors duration-150"
                        >
                            {loading ? 'Building...' : 'Build Package'}
                        </button>
                        {error && (
                            <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-4 text-red-300 text-sm font-mono whitespace-pre-wrap">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Raw JSON Output */}
                    <div className="space-y-3">
                        <label className="text-xs uppercase tracking-widest text-zinc-400 font-medium">
                            Raw JSON Output
                        </label>
                        <textarea
                            readOnly
                            value={rawJson}
                            rows={28}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-sm font-mono text-zinc-400 focus:outline-none resize-none"
                        />
                    </div>
                </div>

                {/* PackageCard Preview */}
                {result && (
                    <div className="space-y-4">
                        <div className="border-t border-white/10 pt-6">
                            <h2 className="text-lg font-semibold text-white mb-1">
                                PackageCard Preview
                                {result.comparisonMode && (
                                    <span className="ml-3 text-sky-400 text-sm font-normal">
                                        Comparison Mode ({result.packages.length} packages)
                                    </span>
                                )}
                            </h2>
                            <p className="text-zinc-500 text-xs mb-4">
                                This is exactly how it will appear inside Hero Chat.
                            </p>
                            <PackageCard packages={result.comparisonMode ? result.packages : result.packages[0]} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
