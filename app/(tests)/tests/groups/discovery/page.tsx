"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw } from "lucide-react";
import { Campaign } from '@/lib/campaigns/types';

export default function DiscoveryTestPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [blueprints, setBlueprints] = useState<Campaign[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [skippedCount, setSkippedCount] = useState(0);

    const handleGenerate = async () => {
        const confirmed = window.confirm(
            'This will make 2× Sonar Deep Research calls + 1× GPT-5-mini call.\n\n' +
            'Estimated cost: ~$1.60 – $2.00\n\n' +
            'Continue?'
        );
        if (!confirmed) return;

        setIsLoading(true);
        setError(null);
        setBlueprints([]);
        setSkippedCount(0);

        try {
            const res = await fetch('/api/groups/discovery');
            const data = await res.json();

            if (data.success && data.blueprints) {
                setBlueprints(data.blueprints);
                setSkippedCount(data.skippedCount ?? 0);
            } else {
                setError(data.error || 'Failed to fetch blueprints');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = () => {
        setBlueprints([]);
        setError(null);
        setSkippedCount(0);
    };

    const hasResults = blueprints.length > 0;

    return (
        <div className="container mx-auto py-10 max-w-7xl">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Group Campaign Discovery</h1>
                    <p className="text-muted-foreground mt-2">
                        Execute the Sonar Deep Research pipeline to generate 5 vetted Theme Cruise Blueprints.
                    </p>
                </div>
                <div className="flex gap-2">
                    {hasResults && (
                        <Button onClick={handleClear} variant="outline" size="lg">
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Clear &amp; Reset
                        </Button>
                    )}
                    <Button onClick={handleGenerate} disabled={isLoading || hasResults} size="lg">
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Researching... (Takes ~2-3 mins)
                            </>
                        ) : hasResults ? (
                            "Results Loaded"
                        ) : (
                            "Generate Blueprints"
                        )}
                    </Button>
                </div>
            </div>

            {skippedCount > 0 && (
                <div className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 p-4 rounded-md mb-4 text-sm">
                    ⚠️ {skippedCount} blueprint(s) already existed in DynamoDB and were skipped.
                </div>
            )}

            {error && (
                <div className="bg-destructive/15 text-destructive p-4 rounded-md mb-8">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {blueprints.map((blueprint, index) => (
                    <Card key={blueprint.id || index} className="flex flex-col">
                        <CardHeader>
                            <div className="flex justify-between items-start mb-2">
                                <Badge variant="secondary" className="mb-2">
                                    {blueprint.aesthetic}
                                </Badge>
                                {blueprint.startingPrice && (
                                    <Badge variant="outline" className="font-mono">
                                        ${blueprint.startingPrice}
                                    </Badge>
                                )}
                            </div>
                            <CardTitle className="text-xl">{blueprint.name}</CardTitle>
                            <CardDescription>{blueprint.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col gap-4">
                            <div className="text-sm">
                                <span className="font-semibold block mb-1">Target Dates:</span>
                                {blueprint.targetDates}
                            </div>
                            <div className="text-sm">
                                <span className="font-semibold block mb-1">Target Ship/Line:</span>
                                {blueprint.shipTarget || 'N/A'}
                            </div>
                            <div className="text-sm flex-1">
                                <span className="font-semibold block mb-1">Highlights:</span>
                                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                    {blueprint.highlightEvents?.map((event, i) => (
                                        <li key={i}>{event}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex gap-2 flex-wrap pt-4 mt-auto border-t">
                                {blueprint.targetingKeywords?.map((keyword, i) => (
                                    <Badge key={i} variant="outline" className="text-xs text-muted-foreground">
                                        {keyword}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {!isLoading && blueprints.length === 0 && !error && (
                <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
                    Click &quot;Generate Blueprints&quot; to begin the deep research process.
                </div>
            )}
        </div>
    );
}
